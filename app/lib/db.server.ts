import Database from "better-sqlite3";
import { discoverProjects, discoverSessions, discoverSubagents, readSessionsIndex } from "./scanner.server";
import { parseSessionFile, extractSummary, extractFirstPrompt } from "./parser.server";
import type { SessionMeta } from "./types";

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      dir_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL
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
      file_mtime REAL NOT NULL DEFAULT 0
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

  return db;
}

export async function importFromDataDir(db: Database.Database, dataDir: string): Promise<void> {
  const projects = await discoverProjects(dataDir);
  const upsertProject = db.prepare("INSERT OR REPLACE INTO projects (dir_id, name, path) VALUES (?, ?, ?)");
  const upsertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions
    (session_id, project_dir_id, first_prompt, summary, message_count, subagent_count,
     created, modified, git_branch, project_path, file_path, file_mtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getSessionMtime = db.prepare("SELECT file_mtime FROM sessions WHERE session_id = ?");

  for (const project of projects) {
    upsertProject.run(project.dirId, project.name, project.path);

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
        upsertSession.run(entry.sessionId, project.dirId, entry.firstPrompt, entry.summary,
          entry.messageCount, subagents.length, entry.created, entry.modified,
          entry.gitBranch, entry.projectPath, fileInfo?.filePath ?? "", mtime);
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
        entries[0]?.gitBranch ?? "", entries[0]?.cwd ?? "", fileInfo.filePath, fileInfo.mtime.getTime());
    }
  }
}

export function getProjects(db: Database.Database): Array<{ dirId: string; name: string; path: string; sessionCount: number }> {
  return db.prepare(`
    SELECT p.dir_id as dirId, p.name, p.path, COUNT(s.session_id) as sessionCount
    FROM projects p LEFT JOIN sessions s ON s.project_dir_id = p.dir_id
    GROUP BY p.dir_id ORDER BY p.name
  `).all() as Array<{ dirId: string; name: string; path: string; sessionCount: number }>;
}

export function getSessionsByProject(db: Database.Database, projectDirId: string, limit = 100, offset = 0): SessionMeta[] {
  return db.prepare(`
    SELECT session_id as sessionId, project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = project_dir_id) as projectName,
           first_prompt as firstPrompt, summary, message_count as messageCount,
           subagent_count as subagentCount, created, modified,
           git_branch as gitBranch, project_path as projectPath
    FROM sessions WHERE project_dir_id = ? ORDER BY modified DESC LIMIT ? OFFSET ?
  `).all(projectDirId, limit, offset) as SessionMeta[];
}

export function getAllSessions(db: Database.Database, limit = 100, offset = 0): SessionMeta[] {
  return db.prepare(`
    SELECT session_id as sessionId, project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = project_dir_id) as projectName,
           first_prompt as firstPrompt, summary, message_count as messageCount,
           subagent_count as subagentCount, created, modified,
           git_branch as gitBranch, project_path as projectPath
    FROM sessions ORDER BY modified DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as SessionMeta[];
}

export function searchSessions(db: Database.Database, query: string, limit = 50): SessionMeta[] {
  return db.prepare(`
    SELECT s.session_id as sessionId, s.project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = s.project_dir_id) as projectName,
           s.first_prompt as firstPrompt, s.summary, s.message_count as messageCount,
           s.subagent_count as subagentCount, s.created, s.modified,
           s.git_branch as gitBranch, s.project_path as projectPath
    FROM sessions_fts fts JOIN sessions s ON s.session_id = fts.session_id
    WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?
  `).all(query, limit) as SessionMeta[];
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) { _db = createDb(process.env.DB_PATH || "sessions.db"); }
  return _db;
}

export async function initDb(): Promise<void> {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) throw new Error("DATA_DIR environment variable is required");
  const db = getDb();
  console.log("Importing sessions from", dataDir);
  await importFromDataDir(db, dataDir);
  const projects = getProjects(db);
  const total = projects.reduce((sum, p) => sum + p.sessionCount, 0);
  console.log(`Imported ${total} sessions across ${projects.length} projects`);
}
