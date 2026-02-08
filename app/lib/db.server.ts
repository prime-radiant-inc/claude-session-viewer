import Database from "better-sqlite3";
import path from "path";
import { discoverProjects, discoverSessions, discoverSubagents, readSessionsIndex, discoverUsers, discoverHosts, discoverUserProjects, detectLayout } from "./scanner.server";
import { parseSessionFile, extractSummary, extractFirstPrompt } from "./parser.server";
import type { SessionMeta } from "./types";

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      dir_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      user TEXT NOT NULL DEFAULT '',
      hostname TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      project_dir_id TEXT NOT NULL REFERENCES projects(dir_id),
      first_prompt TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      message_count INTEGER NOT NULL DEFAULT 0,
      subagent_count INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL DEFAULT '',
      modified TEXT NOT NULL DEFAULT '',
      git_branch TEXT NOT NULL DEFAULT '',
      project_path TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL DEFAULT '',
      file_mtime REAL NOT NULL DEFAULT 0,
      user TEXT NOT NULL DEFAULT ''
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      session_id UNINDEXED,
      first_prompt,
      summary,
      content=sessions,
      content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
      INSERT INTO sessions_fts(rowid, session_id, first_prompt, summary)
      VALUES (new.rowid, new.session_id, new.first_prompt, new.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, session_id, first_prompt, summary)
      VALUES ('delete', old.rowid, old.session_id, old.first_prompt, old.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, session_id, first_prompt, summary)
      VALUES ('delete', old.rowid, old.session_id, old.first_prompt, old.summary);
      INSERT INTO sessions_fts(rowid, session_id, first_prompt, summary)
      VALUES (new.rowid, new.session_id, new.first_prompt, new.summary);
    END;
  `);

  // Migrations: add hidden columns if missing
  const projectCols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectCols.some((c) => c.name === "hidden")) {
    db.exec("ALTER TABLE projects ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
  }
  const sessionCols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (!sessionCols.some((c) => c.name === "hidden")) {
    db.exec("ALTER TABLE sessions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
  }

  return db;
}

export function shouldAutoHide(name: string): boolean {
  // Task agent work directories (random ID + UUID)
  if (/^.+-work-[0-9a-f]{8}-/.test(name)) return true;
  // Toil test/eval runs
  if (name.startsWith("toil-")) return true;
  // Bare temp dirs
  if (name === "tmp") return true;
  return false;
}

async function importProjects(db: Database.Database, projects: Array<{ dirId: string; name: string; path: string }>, user: string, hostname: string): Promise<void> {
  const upsertProject = db.prepare(`
    INSERT INTO projects (dir_id, name, path, user, hostname, hidden) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(dir_id) DO UPDATE SET name=excluded.name, path=excluded.path, user=excluded.user, hostname=excluded.hostname
  `);
  const upsertSession = db.prepare(`
    INSERT INTO sessions
    (session_id, project_dir_id, first_prompt, summary, message_count, subagent_count,
     created, modified, git_branch, project_path, file_path, file_mtime, user)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      project_dir_id=excluded.project_dir_id, first_prompt=excluded.first_prompt,
      summary=excluded.summary, message_count=excluded.message_count,
      subagent_count=excluded.subagent_count, created=excluded.created,
      modified=excluded.modified, git_branch=excluded.git_branch,
      project_path=excluded.project_path, file_path=excluded.file_path,
      file_mtime=excluded.file_mtime, user=excluded.user
  `);
  const getSessionMtime = db.prepare("SELECT file_mtime FROM sessions WHERE session_id = ?");

  const seenDirIds = new Set<string>();
  for (const project of projects) {
    if (!seenDirIds.has(project.dirId)) {
      upsertProject.run(project.dirId, project.name, project.path, user, hostname, shouldAutoHide(project.name) ? 1 : 0);
      seenDirIds.add(project.dirId);
    }

    const index = await readSessionsIndex(project.path);
    const sessionFiles = await discoverSessions(project.path);
    const indexedIds = new Set(index?.entries.map((e) => e.sessionId) ?? []);

    if (index) {
      for (const entry of index.entries) {
        if (entry.isSidechain) continue;
        const fileInfo = sessionFiles.find((s) => s.sessionId === entry.sessionId);
        const mtime = fileInfo?.mtime.getTime() ?? 0;
        const existing = getSessionMtime.get(entry.sessionId) as { file_mtime: number } | undefined;
        if (existing && existing.file_mtime >= mtime) continue;
        const subagents = await discoverSubagents(project.path, entry.sessionId);
        upsertSession.run(entry.sessionId, project.dirId, entry.firstPrompt ?? "", entry.summary ?? "",
          entry.messageCount, subagents.length, entry.created ?? "", entry.modified ?? "",
          entry.gitBranch ?? "", entry.projectPath ?? "", fileInfo?.filePath ?? "", mtime, user);
      }
    }

    for (const fileInfo of sessionFiles) {
      if (indexedIds.has(fileInfo.sessionId)) continue;
      const existing = getSessionMtime.get(fileInfo.sessionId) as { file_mtime: number } | undefined;
      if (existing && existing.file_mtime >= fileInfo.mtime.getTime()) continue;
      const entries = await parseSessionFile(fileInfo.filePath);
      const summary = extractSummary(entries) ?? "";
      const firstPrompt = extractFirstPrompt(entries);
      const messageCount = entries.filter((e) => (e.type === "user" || e.type === "assistant") && !e.isMeta).length;
      const subagents = await discoverSubagents(project.path, fileInfo.sessionId);
      const timestamps = entries.filter((e) => e.timestamp).map((e) => e.timestamp!);
      upsertSession.run(fileInfo.sessionId, project.dirId, firstPrompt, summary, messageCount,
        subagents.length, timestamps[0] ?? "", timestamps[timestamps.length - 1] ?? "",
        entries[0]?.gitBranch ?? "", entries[0]?.cwd ?? "", fileInfo.filePath, fileInfo.mtime.getTime(), user);
    }
  }
}

export async function importFromDataDir(db: Database.Database, dataDir: string): Promise<void> {
  const projects = await discoverProjects(dataDir);
  await importProjects(db, projects, "", "");
}

export async function importMultiUserDataDir(db: Database.Database, dataDir: string): Promise<void> {
  const users = await discoverUsers(dataDir);
  for (const user of users) {
    const userDir = path.join(dataDir, user);
    const hosts = await discoverHosts(userDir);
    for (const hostname of hosts) {
      const projects = await discoverUserProjects(userDir, user, hostname);
      await importProjects(db, projects, user, hostname);
    }
  }
}

export function getProjects(db: Database.Database, user?: string, hostname?: string, includeHidden = false): Array<{ name: string; sessionCount: number; hidden: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (!includeHidden) { conditions.push("p.hidden = 0"); }
  if (user) { conditions.push("p.user = ?"); params.push(user); }
  if (hostname) { conditions.push("p.hostname = ?"); params.push(hostname); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countExpr = includeHidden
    ? "COUNT(s.session_id)"
    : "COUNT(CASE WHEN s.hidden = 0 THEN 1 END)";
  return db.prepare(`
    SELECT p.name, MIN(p.hidden) as hidden, ${countExpr} as sessionCount
    FROM projects p LEFT JOIN sessions s ON s.project_dir_id = p.dir_id
    ${where}
    GROUP BY p.name ORDER BY p.name
  `).all(...params) as Array<{ name: string; sessionCount: number; hidden: number }>;
}

export function getUsers(db: Database.Database): string[] {
  const rows = db.prepare("SELECT DISTINCT user FROM projects WHERE user != '' ORDER BY user").all() as Array<{ user: string }>;
  return rows.map((r) => r.user);
}

export function getHosts(db: Database.Database, user?: string): string[] {
  if (user) {
    const rows = db.prepare("SELECT DISTINCT hostname FROM projects WHERE hostname != '' AND user = ? ORDER BY hostname").all(user) as Array<{ hostname: string }>;
    return rows.map((r) => r.hostname);
  }
  const rows = db.prepare("SELECT DISTINCT hostname FROM projects WHERE hostname != '' ORDER BY hostname").all() as Array<{ hostname: string }>;
  return rows.map((r) => r.hostname);
}

export function getSessionsByProject(db: Database.Database, projectName: string, limit = 100, offset = 0, includeHidden = false): SessionMeta[] {
  const hiddenFilter = includeHidden ? "" : " AND hidden = 0";
  return db.prepare(`
    SELECT session_id as sessionId, project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = project_dir_id) as projectName,
           first_prompt as firstPrompt, summary, message_count as messageCount,
           subagent_count as subagentCount, created, modified,
           git_branch as gitBranch, project_path as projectPath, user, hidden
    FROM sessions WHERE project_dir_id IN (SELECT dir_id FROM projects WHERE name = ?)${hiddenFilter}
    ORDER BY modified DESC LIMIT ? OFFSET ?
  `).all(projectName, limit, offset) as SessionMeta[];
}

export function getAllSessions(db: Database.Database, limit = 100, offset = 0, user?: string, includeHidden = false): SessionMeta[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (!includeHidden) { conditions.push("hidden = 0"); }
  if (user) { conditions.push("user = ?"); params.push(user); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`
    SELECT session_id as sessionId, project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = project_dir_id) as projectName,
           first_prompt as firstPrompt, summary, message_count as messageCount,
           subagent_count as subagentCount, created, modified,
           git_branch as gitBranch, project_path as projectPath, user, hidden
    FROM sessions ${where} ORDER BY modified DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as SessionMeta[];
}

export function searchSessions(db: Database.Database, query: string, limit = 50, user?: string, includeHidden = false): SessionMeta[] {
  const conditions: string[] = ["sessions_fts MATCH ?"];
  const params: (string | number)[] = [query];
  if (!includeHidden) { conditions.push("s.hidden = 0"); }
  if (user) { conditions.push("s.user = ?"); params.push(user); }
  return db.prepare(`
    SELECT s.session_id as sessionId, s.project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = s.project_dir_id) as projectName,
           s.first_prompt as firstPrompt, s.summary, s.message_count as messageCount,
           s.subagent_count as subagentCount, s.created, s.modified,
           s.git_branch as gitBranch, s.project_path as projectPath, s.user, s.hidden
    FROM sessions_fts fts JOIN sessions s ON s.session_id = fts.session_id
    WHERE ${conditions.join(" AND ")} ORDER BY rank LIMIT ?
  `).all(...params, limit) as SessionMeta[];
}

let _db: Database.Database | null = null;
let _initPromise: Promise<void> | null = null;

export function getDb(): Database.Database {
  if (!_db) { _db = createDb(process.env.DB_PATH || "sessions.db"); }
  return _db;
}

export async function ensureInitialized(): Promise<Database.Database> {
  if (!_initPromise) {
    _initPromise = initDb();
  }
  await _initPromise;
  return getDb();
}

async function importDataDir(db: Database.Database, dataDir: string): Promise<void> {
  const layout = await detectLayout(dataDir);
  console.log(`Importing sessions from ${dataDir} (${layout} layout)`);
  if (layout === "multi-user") {
    await importMultiUserDataDir(db, dataDir);
  } else {
    await importFromDataDir(db, dataDir);
  }
  const projects = getProjects(db, undefined, undefined, true);
  const total = projects.reduce((sum, p) => sum + p.sessionCount, 0);
  console.log(`Imported ${total} sessions across ${projects.length} projects`);
}

async function initDb(): Promise<void> {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) throw new Error("DATA_DIR environment variable is required");
  await importDataDir(getDb(), dataDir);
}

export function setSessionHidden(db: Database.Database, sessionId: string, hidden: boolean): void {
  db.prepare("UPDATE sessions SET hidden = ? WHERE session_id = ?").run(hidden ? 1 : 0, sessionId);
}

export function setProjectHidden(db: Database.Database, projectName: string, hidden: boolean): void {
  const setHidden = hidden ? 1 : 0;
  db.prepare("UPDATE projects SET hidden = ? WHERE name = ?").run(setHidden, projectName);
  db.prepare("UPDATE sessions SET hidden = ? WHERE project_dir_id IN (SELECT dir_id FROM projects WHERE name = ?)").run(setHidden, projectName);
}

export async function rescanDb(): Promise<void> {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) throw new Error("DATA_DIR environment variable is required");
  await importDataDir(getDb(), dataDir);
  _initPromise = Promise.resolve();
}
