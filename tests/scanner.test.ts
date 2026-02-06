import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { discoverProjects, discoverSessions, discoverSubagents, parseProjectName, readSessionsIndex, discoverUsers, discoverUserProjects, detectLayout } from "~/lib/scanner.server";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(path.join(tmpdir(), "se-test-"));
  const p1 = path.join(testDir, "-Users-jesse-prime-radiant");
  mkdirSync(p1);
  writeFileSync(path.join(p1, "aaa-111.jsonl"), '{"type":"user"}\n');
  writeFileSync(path.join(p1, "bbb-222.jsonl"), '{"type":"user"}\n');
  writeFileSync(path.join(p1, "sessions-index.json"), '{"version":1,"entries":[]}');
  const sub = path.join(p1, "aaa-111", "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(path.join(sub, "agent-abc123.jsonl"), '{"type":"user"}\n');
  const p2 = path.join(testDir, "-Users-jesse-prime-radiant-scribble");
  mkdirSync(p2);
  writeFileSync(path.join(p2, "ccc-333.jsonl"), '{"type":"user"}\n');
});

afterEach(() => { rmSync(testDir, { recursive: true, force: true }); });

describe("parseProjectName", () => {
  it("extracts project name from encoded directory name", () => {
    expect(parseProjectName("-Users-jesse-prime-radiant")).toBe("prime-radiant");
  });
  it("returns raw joined name without sub-project detection", () => {
    expect(parseProjectName("-Users-jesse-prime-radiant-scribble")).toBe("prime-radiant-scribble");
  });
});

describe("discoverProjects", () => {
  it("finds all project directories", async () => {
    const projects = await discoverProjects(testDir);
    expect(projects.length).toBe(2);
    expect(projects.map((p) => p.name).sort()).toEqual(["prime-radiant", "prime-radiant/scribble"]);
  });
});

describe("discoverSessions", () => {
  it("finds JSONL session files", async () => {
    const sessions = await discoverSessions(path.join(testDir, "-Users-jesse-prime-radiant"));
    expect(sessions.map((s) => s.sessionId).sort()).toEqual(["aaa-111", "bbb-222"]);
  });
});

describe("readSessionsIndex", () => {
  it("reads and parses sessions-index.json when present", async () => {
    const index = await readSessionsIndex(path.join(testDir, "-Users-jesse-prime-radiant"));
    expect(index).not.toBeNull();
    expect(index!.version).toBe(1);
    expect(index!.entries).toEqual([]);
  });
  it("returns null when no index file exists", async () => {
    const index = await readSessionsIndex(path.join(testDir, "-Users-jesse-prime-radiant-scribble"));
    expect(index).toBeNull();
  });
});

describe("discoverSubagents", () => {
  it("finds subagent files for a session", async () => {
    const subs = await discoverSubagents(path.join(testDir, "-Users-jesse-prime-radiant"), "aaa-111");
    expect(subs.length).toBe(1);
    expect(subs[0].agentId).toBe("abc123");
  });
  it("returns empty when no subagents", async () => {
    const subs = await discoverSubagents(path.join(testDir, "-Users-jesse-prime-radiant"), "bbb-222");
    expect(subs).toEqual([]);
  });
});

// =============================================================================
// Multi-user layout tests
// =============================================================================

describe("discoverUsers", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-mu-test-"));
    // Multi-user layout: user dirs don't start with "-"
    const jesse = path.join(multiUserDir, "jesse");
    const drew = path.join(multiUserDir, "drew");
    mkdirSync(path.join(jesse, "prime-radiant"), { recursive: true });
    mkdirSync(path.join(jesse, "scribble"), { recursive: true });
    mkdirSync(path.join(drew, "prime-radiant"), { recursive: true });
    writeFileSync(path.join(jesse, "prime-radiant", "aaa-111.jsonl"), '{"type":"user"}\n');
    writeFileSync(path.join(jesse, "scribble", "bbb-222.jsonl"), '{"type":"user"}\n');
    writeFileSync(path.join(drew, "prime-radiant", "ccc-333.jsonl"), '{"type":"user"}\n');
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("returns user directory names sorted alphabetically", async () => {
    const users = await discoverUsers(multiUserDir);
    expect(users).toEqual(["drew", "jesse"]);
  });

  it("ignores directories starting with hyphen (old layout)", async () => {
    mkdirSync(path.join(multiUserDir, "-Users-jesse-foo"));
    const users = await discoverUsers(multiUserDir);
    expect(users).toEqual(["drew", "jesse"]);
  });

  it("ignores files (non-directories)", async () => {
    writeFileSync(path.join(multiUserDir, "somefile.txt"), "");
    const users = await discoverUsers(multiUserDir);
    expect(users).toEqual(["drew", "jesse"]);
  });
});

describe("discoverUserProjects", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-mu-test-"));
    const jesse = path.join(multiUserDir, "jesse");
    mkdirSync(path.join(jesse, "prime-radiant"), { recursive: true });
    mkdirSync(path.join(jesse, "scribble"), { recursive: true });
    writeFileSync(path.join(jesse, "prime-radiant", "aaa-111.jsonl"), '{"type":"user"}\n');
    writeFileSync(path.join(jesse, "scribble", "bbb-222.jsonl"), '{"type":"user"}\n');
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("returns projects within a user directory", async () => {
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"));
    expect(projects.length).toBe(2);
    const names = projects.map((p) => p.name).sort();
    expect(names).toEqual(["prime-radiant", "scribble"]);
  });

  it("uses user/project as dirId", async () => {
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"));
    const pr = projects.find((p) => p.name === "prime-radiant");
    expect(pr?.dirId).toBe("jesse/prime-radiant");
  });

  it("includes full path", async () => {
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"));
    const pr = projects.find((p) => p.name === "prime-radiant");
    expect(pr?.path).toBe(path.join(multiUserDir, "jesse", "prime-radiant"));
  });
});

describe("detectLayout", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-layout-test-"));
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("detects old layout when dirs start with hyphen", async () => {
    mkdirSync(path.join(multiUserDir, "-Users-jesse-foo"));
    mkdirSync(path.join(multiUserDir, "-Users-drew-bar"));
    expect(await detectLayout(multiUserDir)).toBe("single-user");
  });

  it("detects multi-user layout when dirs don't start with hyphen", async () => {
    mkdirSync(path.join(multiUserDir, "jesse"));
    mkdirSync(path.join(multiUserDir, "drew"));
    expect(await detectLayout(multiUserDir)).toBe("multi-user");
  });

  it("detects multi-user even with non-directory files present", async () => {
    mkdirSync(path.join(multiUserDir, "jesse"));
    writeFileSync(path.join(multiUserDir, ".session-explorer.db"), "");
    expect(await detectLayout(multiUserDir)).toBe("multi-user");
  });

  it("returns single-user for empty directory", async () => {
    expect(await detectLayout(multiUserDir)).toBe("single-user");
  });
});
