import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { createDb, importFromDataDir, importMultiUserDataDir, importCodexSessions, searchSessions, getSessionsByProject, getProjects, getUsers, getAllSessions, setSessionHidden, setProjectHidden, shouldAutoHide } from "~/lib/db.server";
import type Database from "better-sqlite3";

let testDir: string;
let db: Database.Database;

beforeEach(() => {
  testDir = mkdtempSync(path.join(tmpdir(), "se-db-test-"));
  const projectDir = path.join(testDir, "-Users-jesse-prime-radiant");
  mkdirSync(projectDir);
  writeFileSync(path.join(projectDir, "aaa-111.jsonl"),
    '{"type":"user","uuid":"u1","sessionId":"aaa-111","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"fix the login bug"}}\n{"type":"summary","summary":"Fixed authentication bug","leafUuid":"u1"}\n');
  writeFileSync(path.join(projectDir, "bbb-222.jsonl"),
    '{"type":"user","uuid":"u2","sessionId":"bbb-222","timestamp":"2026-01-22T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"add dark mode support"}}\n{"type":"summary","summary":"Added dark mode","leafUuid":"u2"}\n');
  writeFileSync(path.join(projectDir, "sessions-index.json"), JSON.stringify({
    version: 1,
    entries: [
      { sessionId: "aaa-111", fullPath: path.join(projectDir, "aaa-111.jsonl"), firstPrompt: "fix the login bug", summary: "Fixed authentication bug", messageCount: 10, created: "2026-01-21T10:00:00Z", modified: "2026-01-21T11:00:00Z", gitBranch: "main", projectPath: "/Users/jesse/prime-radiant", isSidechain: false },
      { sessionId: "bbb-222", fullPath: path.join(projectDir, "bbb-222.jsonl"), firstPrompt: "add dark mode support", summary: "Added dark mode", messageCount: 20, created: "2026-01-22T10:00:00Z", modified: "2026-01-22T12:00:00Z", gitBranch: "feat/dark-mode", projectPath: "/Users/jesse/prime-radiant", isSidechain: false },
    ],
  }));
  const subDir = path.join(projectDir, "aaa-111", "subagents");
  mkdirSync(subDir, { recursive: true });
  writeFileSync(path.join(subDir, "agent-x1.jsonl"), '{"type":"user"}\n');
  db = createDb(":memory:");
});

afterEach(() => { db.close(); rmSync(testDir, { recursive: true, force: true }); });

describe("createDb", () => {
  it("creates tables and FTS index", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("projects");
    expect(names).toContain("sessions");
    expect(names).toContain("sessions_fts");
  });

  it("adds hidden column to projects table", () => {
    const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("hidden");
  });

  it("adds hidden column to sessions table", () => {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("hidden");
  });

  it("defaults hidden to 0", () => {
    db.prepare("INSERT INTO projects (dir_id, name, path) VALUES ('test', 'test', '/test')").run();
    const row = db.prepare("SELECT hidden FROM projects WHERE dir_id = 'test'").get() as { hidden: number };
    expect(row.hidden).toBe(0);
  });
});

describe("importFromDataDir", () => {
  it("imports projects and sessions", async () => {
    await importFromDataDir(db, testDir);
    const projects = getProjects(db);
    expect(projects.length).toBe(1);
    const sessions = getSessionsByProject(db, projects[0].name);
    expect(sessions.length).toBe(2);
  });

  it("populates session metadata from index", async () => {
    await importFromDataDir(db, testDir);
    const projects = getProjects(db);
    const sessions = getSessionsByProject(db, projects[0].name);
    const s = sessions.find((s) => s.sessionId === "aaa-111");
    expect(s?.summary).toBe("Fixed authentication bug");
    expect(s?.firstPrompt).toBe("fix the login bug");
    expect(s?.subagentCount).toBe(1);
  });
});

describe("rescan preserves hidden state", () => {
  it("does not reset hidden flag on projects during reimport", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE projects SET hidden = 1 WHERE dir_id = ?").run("-Users-jesse-prime-radiant");
    await importFromDataDir(db, testDir);
    const row = db.prepare("SELECT hidden FROM projects WHERE dir_id = ?").get("-Users-jesse-prime-radiant") as { hidden: number };
    expect(row.hidden).toBe(1);
  });

  it("does not reset hidden flag on sessions during reimport", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    // Touch the file to force re-import by bumping mtime
    const projectDir = path.join(testDir, "-Users-jesse-prime-radiant");
    const now = Date.now() / 1000 + 10;
    const { utimesSync } = await import("fs");
    utimesSync(path.join(projectDir, "aaa-111.jsonl"), now, now);
    await importFromDataDir(db, testDir);
    const row = db.prepare("SELECT hidden FROM sessions WHERE session_id = ?").get("aaa-111") as { hidden: number };
    expect(row.hidden).toBe(1);
  });
});

describe("searchSessions", () => {
  it("finds sessions by summary text", async () => {
    await importFromDataDir(db, testDir);
    const results = searchSessions(db, "authentication");
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe("aaa-111");
  });

  it("finds sessions by first prompt text", async () => {
    await importFromDataDir(db, testDir);
    const results = searchSessions(db, "dark mode");
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe("bbb-222");
  });

  it("returns empty for no matches", async () => {
    await importFromDataDir(db, testDir);
    expect(searchSessions(db, "nonexistent xyz")).toEqual([]);
  });
});

describe("hidden filtering", () => {
  it("getProjects excludes hidden projects by default", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE projects SET hidden = 1 WHERE dir_id = ?").run("-Users-jesse-prime-radiant");
    const projects = getProjects(db);
    expect(projects.length).toBe(0);
  });

  it("getProjects includes hidden projects when requested", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE projects SET hidden = 1 WHERE dir_id = ?").run("-Users-jesse-prime-radiant");
    const projects = getProjects(db, undefined, undefined, true);
    expect(projects.length).toBe(1);
  });

  it("getProjects session count excludes hidden sessions by default", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const projects = getProjects(db);
    expect(projects[0].sessionCount).toBe(1);
  });

  it("getProjects session count includes hidden sessions in admin mode", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const projects = getProjects(db, undefined, undefined, true);
    expect(projects[0].sessionCount).toBe(2);
  });

  it("getAllSessions excludes hidden sessions by default", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const sessions = getAllSessions(db);
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe("bbb-222");
  });

  it("getAllSessions includes hidden sessions when requested", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    expect(sessions.length).toBe(2);
  });

  it("getSessionsByProject excludes hidden sessions by default", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const sessions = getSessionsByProject(db, "prime-radiant");
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe("bbb-222");
  });

  it("getSessionsByProject includes hidden sessions when requested", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const sessions = getSessionsByProject(db, "prime-radiant", 100, 0, true);
    expect(sessions.length).toBe(2);
  });

  it("searchSessions excludes hidden sessions by default", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const results = searchSessions(db, "bug");
    expect(results.length).toBe(0);
  });

  it("searchSessions includes hidden sessions when requested", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const results = searchSessions(db, "bug", 50, undefined, true);
    expect(results.length).toBe(1);
  });

  it("sessions include hidden field", async () => {
    await importFromDataDir(db, testDir);
    db.prepare("UPDATE sessions SET hidden = 1 WHERE session_id = ?").run("aaa-111");
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const hidden = sessions.find((s) => s.sessionId === "aaa-111");
    const visible = sessions.find((s) => s.sessionId === "bbb-222");
    expect(hidden!.hidden).toBe(1);
    expect(visible!.hidden).toBe(0);
  });

  it("setSessionHidden hides a single session", async () => {
    await importFromDataDir(db, testDir);
    setSessionHidden(db, "aaa-111", true);
    const sessions = getAllSessions(db);
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe("bbb-222");
  });

  it("setSessionHidden unhides a session", async () => {
    await importFromDataDir(db, testDir);
    setSessionHidden(db, "aaa-111", true);
    setSessionHidden(db, "aaa-111", false);
    const sessions = getAllSessions(db);
    expect(sessions.length).toBe(2);
  });

  it("setProjectHidden hides project and cascades to sessions", async () => {
    await importFromDataDir(db, testDir);
    setProjectHidden(db, "prime-radiant", true);
    expect(getProjects(db).length).toBe(0);
    expect(getAllSessions(db).length).toBe(0);
  });

  it("setProjectHidden unhides project and cascades to sessions", async () => {
    await importFromDataDir(db, testDir);
    setProjectHidden(db, "prime-radiant", true);
    setProjectHidden(db, "prime-radiant", false);
    expect(getProjects(db).length).toBe(1);
    expect(getAllSessions(db).length).toBe(2);
  });
});

// =============================================================================
// Multi-user import and queries
// =============================================================================

describe("importMultiUserDataDir", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-mu-db-test-"));
    // jesse/paradise-park/prime-radiant with index
    const jesseDir = path.join(multiUserDir, "jesse", "paradise-park", "prime-radiant");
    mkdirSync(jesseDir, { recursive: true });
    writeFileSync(path.join(jesseDir, "aaa-111.jsonl"),
      '{"type":"user","uuid":"u1","sessionId":"aaa-111","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"fix the login bug"}}\n{"type":"summary","summary":"Fixed auth bug","leafUuid":"u1"}\n');
    writeFileSync(path.join(jesseDir, "sessions-index.json"), JSON.stringify({
      version: 1,
      entries: [
        { sessionId: "aaa-111", fullPath: path.join(jesseDir, "aaa-111.jsonl"), firstPrompt: "fix the login bug", summary: "Fixed auth bug", messageCount: 10, created: "2026-01-21T10:00:00Z", modified: "2026-01-21T11:00:00Z", gitBranch: "main", projectPath: "/Users/jesse/prime-radiant", isSidechain: false },
      ],
    }));

    // drew/drews-laptop/prime-radiant without index (fallback to parsing)
    const drewDir = path.join(multiUserDir, "drew", "drews-laptop", "prime-radiant");
    mkdirSync(drewDir, { recursive: true });
    writeFileSync(path.join(drewDir, "ddd-444.jsonl"),
      '{"type":"user","uuid":"u3","sessionId":"ddd-444","timestamp":"2026-01-23T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"deploy the app"}}\n{"type":"summary","summary":"Deployed app","leafUuid":"u3"}\n');
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("imports projects and sessions with user field", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const projects = getProjects(db);
    // Both "prime-radiant" projects collapse into one entry
    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe("prime-radiant");
    expect(projects[0].sessionCount).toBe(2);
  });

  it("separates projects by user when user filter is active", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const jesseProjects = getProjects(db, "jesse");
    const drewProjects = getProjects(db, "drew");
    expect(jesseProjects.length).toBe(1);
    expect(drewProjects.length).toBe(1);
    expect(jesseProjects[0].sessionCount).toBe(1);
    expect(drewProjects[0].sessionCount).toBe(1);
  });

  it("sets user on sessions", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const allSessions = getAllSessions(db);
    const jesseSessions = allSessions.filter((s) => s.user === "jesse");
    const drewSessions = allSessions.filter((s) => s.user === "drew");
    expect(jesseSessions.length).toBe(1);
    expect(drewSessions.length).toBe(1);
    expect(jesseSessions[0].sessionId).toBe("aaa-111");
    expect(drewSessions[0].sessionId).toBe("ddd-444");
  });
});

describe("getUsers", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-users-test-"));
    for (const [user, host] of [["jesse", "paradise-park"], ["drew", "drews-laptop"]]) {
      const dir = path.join(multiUserDir, user, host, "proj");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "s1.jsonl"),
        `{"type":"user","uuid":"u","sessionId":"s-${user}","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"hello"}}\n`);
    }
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("returns distinct users sorted alphabetically", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const users = getUsers(db);
    expect(users).toEqual(["drew", "jesse"]);
  });
});

describe("user-filtered queries", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-filter-test-"));
    for (const [user, host] of [["jesse", "paradise-park"], ["drew", "drews-laptop"]]) {
      const dir = path.join(multiUserDir, user, host, "proj");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${user}-session.jsonl`),
        `{"type":"user","uuid":"u","sessionId":"${user}-session","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"hello from ${user}"}}\n{"type":"summary","summary":"Work by ${user}","leafUuid":"u"}\n`);
    }
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("getProjects filters by user", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const jesseProjects = getProjects(db, "jesse");
    expect(jesseProjects.length).toBe(1);
    expect(jesseProjects[0].name).toBe("proj");
  });

  it("getAllSessions filters by user", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const jesseSessions = getAllSessions(db, 100, 0, "jesse");
    expect(jesseSessions.length).toBe(1);
    expect(jesseSessions[0].user).toBe("jesse");
    expect(jesseSessions[0].sessionId).toBe("jesse-session");
  });

  it("searchSessions filters by user", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const results = searchSessions(db, "hello", 50, "jesse");
    expect(results.length).toBe(1);
    expect(results[0].user).toBe("jesse");
  });
});

describe("shouldAutoHide", () => {
  it("hides task agent work directories", () => {
    expect(shouldAutoHide("5UCWGY4Y6o-work-1d79f99c-aac3-4d71-959e-92c92196345b")).toBe(true);
  });

  it("hides toil test runs", () => {
    expect(shouldAutoHide("toil-eval-20260204-150200")).toBe(true);
    expect(shouldAutoHide("toil-cow-clicker.QpjK1x")).toBe(true);
  });

  it("hides bare tmp directory", () => {
    expect(shouldAutoHide("tmp")).toBe(true);
  });

  it("does not hide normal projects", () => {
    expect(shouldAutoHide("prime-radiant")).toBe(false);
    expect(shouldAutoHide("lace")).toBe(false);
    expect(shouldAutoHide("claude-pa")).toBe(false);
  });
});

describe("auto-hide on import", () => {
  it("auto-hides warmup projects during initial import", async () => {
    const warmupDir = path.join(testDir, "-Users-jesse-tmp");
    mkdirSync(warmupDir);
    writeFileSync(path.join(warmupDir, "xxx-999.jsonl"),
      '{"type":"user","uuid":"u9","sessionId":"xxx-999","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"warmup"}}\n');
    await importFromDataDir(db, testDir);
    const allProjects = getProjects(db, undefined, undefined, true);
    const warmup = allProjects.find((p) => p.name === "tmp");
    expect(warmup).toBeDefined();
    expect(warmup!.hidden).toBe(1);
  });

  it("preserves user-shown state on rescan", async () => {
    const warmupDir = path.join(testDir, "-Users-jesse-tmp");
    mkdirSync(warmupDir);
    writeFileSync(path.join(warmupDir, "xxx-999.jsonl"),
      '{"type":"user","uuid":"u9","sessionId":"xxx-999","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"warmup"}}\n');
    await importFromDataDir(db, testDir);
    // User explicitly shows it
    db.prepare("UPDATE projects SET hidden = 0 WHERE name = 'tmp'").run();
    await importFromDataDir(db, testDir);
    const row = db.prepare("SELECT hidden FROM projects WHERE name = 'tmp'").get() as { hidden: number };
    expect(row.hidden).toBe(0);
  });
});

// =============================================================================
// Agent column migration
// =============================================================================

describe("agent column migration", () => {
  it("adds agent column to sessions table", () => {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("agent");
  });

  it("defaults agent to 'claude'", () => {
    db.prepare("INSERT INTO projects (dir_id, name, path) VALUES ('test', 'test', '/test')").run();
    db.prepare("INSERT INTO sessions (session_id, project_dir_id) VALUES ('s1', 'test')").run();
    const row = db.prepare("SELECT agent FROM sessions WHERE session_id = 's1'").get() as { agent: string };
    expect(row.agent).toBe("claude");
  });
});

// =============================================================================
// Codex import
// =============================================================================

describe("importCodexSessions", () => {
  let codexDir: string;

  beforeEach(() => {
    codexDir = mkdtempSync(path.join(tmpdir(), "se-codex-import-"));
    const dayDir = path.join(codexDir, "sessions", "2026", "02", "03");
    mkdirSync(dayDir, { recursive: true });
    // Interactive session
    writeFileSync(path.join(dayDir, "rollout-2026-02-03T00-02-31-019c2286-484a-7550-b53b-cd4e1fd7c5e4.jsonl"),
      '{"timestamp":"2026-02-03T08:02:31.655Z","type":"session_meta","payload":{"id":"019c2286-484a-7550-b53b-cd4e1fd7c5e4","cwd":"/Users/jesse/my-project","originator":"codex_cli_rs","git":{"branch":"main"}}}\n' +
      '{"timestamp":"2026-02-03T08:02:31.660Z","type":"event_msg","payload":{"type":"user_message","message":"Fix the login bug"}}\n' +
      '{"timestamp":"2026-02-03T08:02:33.377Z","type":"turn_context","payload":{"model":"gpt-5.2-codex"}}\n' +
      '{"timestamp":"2026-02-03T08:02:55.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Fixed it."}}\n',
    );
    // codex_exec session (should be skipped)
    writeFileSync(path.join(dayDir, "rollout-2026-02-03T10-00-00-019c2286-exec-7550-b53b-cd4e1fd7c5e4.jsonl"),
      '{"timestamp":"2026-02-03T10:00:00.000Z","type":"session_meta","payload":{"id":"019c2286-exec-7550-b53b-cd4e1fd7c5e4","cwd":"/tmp/automated","originator":"codex_exec"}}\n' +
      '{"timestamp":"2026-02-03T10:00:01.000Z","type":"event_msg","payload":{"type":"user_message","message":"Run tests"}}\n',
    );
  });

  afterEach(() => { rmSync(codexDir, { recursive: true, force: true }); });

  it("imports interactive Codex sessions", async () => {
    await importCodexSessions(db, codexDir);
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const codexSessions = sessions.filter((s) => s.sessionId.startsWith("codex:"));
    expect(codexSessions.length).toBe(1);
  });

  it("skips codex_exec sessions", async () => {
    await importCodexSessions(db, codexDir);
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const execSessions = sessions.filter((s) => s.sessionId.includes("exec"));
    expect(execSessions.length).toBe(0);
  });

  it("prefixes session IDs with codex:", async () => {
    await importCodexSessions(db, codexDir);
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const codexSession = sessions.find((s) => s.sessionId.startsWith("codex:"));
    expect(codexSession).toBeDefined();
    expect(codexSession!.sessionId).toBe("codex:019c2286-484a-7550-b53b-cd4e1fd7c5e4");
  });

  it("sets agent to codex", async () => {
    await importCodexSessions(db, codexDir);
    const row = db.prepare("SELECT agent FROM sessions WHERE session_id LIKE 'codex:%'").get() as { agent: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.agent).toBe("codex");
  });

  it("derives project name from cwd", async () => {
    await importCodexSessions(db, codexDir);
    const projects = getProjects(db);
    expect(projects.some((p) => p.name === "my-project")).toBe(true);
  });

  it("extracts first prompt", async () => {
    await importCodexSessions(db, codexDir);
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const codexSession = sessions.find((s) => s.sessionId.startsWith("codex:"));
    expect(codexSession!.firstPrompt).toBe("Fix the login bug");
  });

  it("extracts git branch", async () => {
    await importCodexSessions(db, codexDir);
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const codexSession = sessions.find((s) => s.sessionId.startsWith("codex:"));
    expect(codexSession!.gitBranch).toBe("main");
  });

  it("skips unchanged files on reimport", async () => {
    await importCodexSessions(db, codexDir);
    // Re-import should not error and session should still be there
    await importCodexSessions(db, codexDir);
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const codexSessions = sessions.filter((s) => s.sessionId.startsWith("codex:"));
    expect(codexSessions.length).toBe(1);
  });

  it("includes agent field in session metadata", async () => {
    await importCodexSessions(db, codexDir);
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const codexSession = sessions.find((s) => s.sessionId.startsWith("codex:"));
    expect(codexSession!.agent).toBe("codex");
  });

  it("returns empty gracefully for nonexistent codex dir", async () => {
    await importCodexSessions(db, "/nonexistent/path");
    const sessions = getAllSessions(db, 100, 0, undefined, true);
    const codexSessions = sessions.filter((s) => s.sessionId.startsWith("codex:"));
    expect(codexSessions.length).toBe(0);
  });
});

describe("mixed agent queries", () => {
  let codexDir: string;

  beforeEach(async () => {
    // Import Claude sessions from testDir (setup in outer beforeEach)
    await importFromDataDir(db, testDir);

    // Set up and import Codex sessions
    codexDir = mkdtempSync(path.join(tmpdir(), "se-mixed-"));
    const dayDir = path.join(codexDir, "sessions", "2026", "02", "03");
    mkdirSync(dayDir, { recursive: true });
    writeFileSync(path.join(dayDir, "rollout-2026-02-03T00-02-31-019c2286-484a-7550-b53b-cd4e1fd7c5e4.jsonl"),
      '{"timestamp":"2026-02-03T08:02:31.655Z","type":"session_meta","payload":{"id":"019c2286-484a-7550-b53b-cd4e1fd7c5e4","cwd":"/Users/jesse/my-project","originator":"codex_cli_rs"}}\n' +
      '{"timestamp":"2026-02-03T08:02:31.660Z","type":"event_msg","payload":{"type":"user_message","message":"Codex task: build something"}}\n' +
      '{"timestamp":"2026-02-03T08:02:55.000Z","type":"event_msg","payload":{"type":"agent_message","message":"Done building."}}\n',
    );
    await importCodexSessions(db, codexDir);
  });

  afterEach(() => { rmSync(codexDir, { recursive: true, force: true }); });

  it("getAllSessions returns both Claude and Codex sessions", () => {
    const sessions = getAllSessions(db);
    expect(sessions.length).toBe(3); // 2 Claude + 1 Codex
  });

  it("getAllSessions can filter by agent", () => {
    const claudeSessions = getAllSessions(db, 100, 0, undefined, false, "claude");
    expect(claudeSessions.length).toBe(2);
    const codexSessions = getAllSessions(db, 100, 0, undefined, false, "codex");
    expect(codexSessions.length).toBe(1);
  });

  it("searchSessions finds Codex sessions by content", () => {
    const results = searchSessions(db, "Codex task");
    expect(results.length).toBe(1);
    expect(results[0].agent).toBe("codex");
  });
});
