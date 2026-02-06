import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { createDb, importFromDataDir, importMultiUserDataDir, searchSessions, getSessionsByProject, getProjects, getUsers, getAllSessions } from "~/lib/db.server";
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
});

describe("importFromDataDir", () => {
  it("imports projects and sessions", async () => {
    await importFromDataDir(db, testDir);
    const projects = getProjects(db);
    expect(projects.length).toBe(1);
    const sessions = getSessionsByProject(db, projects[0].dirId);
    expect(sessions.length).toBe(2);
  });

  it("populates session metadata from index", async () => {
    await importFromDataDir(db, testDir);
    const projects = getProjects(db);
    const sessions = getSessionsByProject(db, projects[0].dirId);
    const s = sessions.find((s) => s.sessionId === "aaa-111");
    expect(s?.summary).toBe("Fixed authentication bug");
    expect(s?.firstPrompt).toBe("fix the login bug");
    expect(s?.subagentCount).toBe(1);
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

// =============================================================================
// Multi-user import and queries
// =============================================================================

describe("importMultiUserDataDir", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-mu-db-test-"));
    // jesse/prime-radiant with index
    const jesseDir = path.join(multiUserDir, "jesse", "prime-radiant");
    mkdirSync(jesseDir, { recursive: true });
    writeFileSync(path.join(jesseDir, "aaa-111.jsonl"),
      '{"type":"user","uuid":"u1","sessionId":"aaa-111","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"fix the login bug"}}\n{"type":"summary","summary":"Fixed auth bug","leafUuid":"u1"}\n');
    writeFileSync(path.join(jesseDir, "sessions-index.json"), JSON.stringify({
      version: 1,
      entries: [
        { sessionId: "aaa-111", fullPath: path.join(jesseDir, "aaa-111.jsonl"), firstPrompt: "fix the login bug", summary: "Fixed auth bug", messageCount: 10, created: "2026-01-21T10:00:00Z", modified: "2026-01-21T11:00:00Z", gitBranch: "main", projectPath: "/Users/jesse/prime-radiant", isSidechain: false },
      ],
    }));

    // drew/prime-radiant without index (fallback to parsing)
    const drewDir = path.join(multiUserDir, "drew", "prime-radiant");
    mkdirSync(drewDir, { recursive: true });
    writeFileSync(path.join(drewDir, "ddd-444.jsonl"),
      '{"type":"user","uuid":"u3","sessionId":"ddd-444","timestamp":"2026-01-23T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"deploy the app"}}\n{"type":"summary","summary":"Deployed app","leafUuid":"u3"}\n');
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("imports projects and sessions with user field", async () => {
    await importMultiUserDataDir(db, multiUserDir);
    const projects = getProjects(db);
    expect(projects.length).toBe(2);
    // Both should have user set
    const jesseProject = projects.find((p) => p.user === "jesse");
    const drewProject = projects.find((p) => p.user === "drew");
    expect(jesseProject).toBeDefined();
    expect(drewProject).toBeDefined();
    expect(jesseProject!.name).toBe("prime-radiant");
    expect(drewProject!.name).toBe("prime-radiant");
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
    for (const user of ["jesse", "drew"]) {
      const dir = path.join(multiUserDir, user, "proj");
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
    for (const user of ["jesse", "drew"]) {
      const dir = path.join(multiUserDir, user, "proj");
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
    expect(jesseProjects[0].user).toBe("jesse");
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
