import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { discoverProjects, discoverSessions, discoverSubagents, parseProjectName, readSessionsIndex, discoverUsers, discoverHosts, discoverUserProjects, detectLayout } from "~/lib/scanner.server";

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
  it("filters empty segments from dot-directory encoding", () => {
    expect(parseProjectName("-Users-jesse--clank")).toBe("clank");
  });
  it("falls back to last segment when path is too short", () => {
    expect(parseProjectName("-Users-jesse")).toBe("jesse");
  });
  it("handles tmp paths", () => {
    expect(parseProjectName("-tmp-planning")).toBe("planning");
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

describe("discoverHosts", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-hosts-test-"));
    const userDir = path.join(multiUserDir, "jesse");
    // paradise-park is a hostname dir (contains project dirs, not .jsonl files)
    mkdirSync(path.join(userDir, "paradise-park", "prime-radiant"), { recursive: true });
    writeFileSync(path.join(userDir, "paradise-park", "prime-radiant", "aaa-111.jsonl"), '{"type":"user"}\n');
    // another-host is also a hostname dir
    mkdirSync(path.join(userDir, "another-host", "scribble"), { recursive: true });
    writeFileSync(path.join(userDir, "another-host", "scribble", "bbb-222.jsonl"), '{"type":"user"}\n');
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("returns hostname directories sorted alphabetically", async () => {
    const hosts = await discoverHosts(path.join(multiUserDir, "jesse"));
    expect(hosts).toEqual(["another-host", "paradise-park"]);
  });

  it("ignores directories starting with dot", async () => {
    mkdirSync(path.join(multiUserDir, "jesse", ".hidden"));
    const hosts = await discoverHosts(path.join(multiUserDir, "jesse"));
    expect(hosts).toEqual(["another-host", "paradise-park"]);
  });
});

describe("discoverUserProjects", () => {
  let multiUserDir: string;

  beforeEach(() => {
    multiUserDir = mkdtempSync(path.join(tmpdir(), "se-mu-test-"));
    const hostDir = path.join(multiUserDir, "jesse", "paradise-park");
    mkdirSync(path.join(hostDir, "prime-radiant"), { recursive: true });
    mkdirSync(path.join(hostDir, "scribble"), { recursive: true });
    writeFileSync(path.join(hostDir, "prime-radiant", "aaa-111.jsonl"), '{"type":"user"}\n');
    writeFileSync(path.join(hostDir, "scribble", "bbb-222.jsonl"), '{"type":"user"}\n');
  });

  afterEach(() => { rmSync(multiUserDir, { recursive: true, force: true }); });

  it("returns projects within a hostname directory", async () => {
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"), "jesse", "paradise-park");
    expect(projects.length).toBe(2);
    const names = projects.map((p) => p.name).sort();
    expect(names).toEqual(["prime-radiant", "scribble"]);
  });

  it("uses user/hostname/project as dirId", async () => {
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"), "jesse", "paradise-park");
    const pr = projects.find((p) => p.name === "prime-radiant");
    expect(pr?.dirId).toBe("jesse/paradise-park/prime-radiant");
  });

  it("includes full path", async () => {
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"), "jesse", "paradise-park");
    const pr = projects.find((p) => p.name === "prime-radiant");
    expect(pr?.path).toBe(path.join(multiUserDir, "jesse", "paradise-park", "prime-radiant"));
  });

  it("decodes encoded directory names starting with hyphen", async () => {
    const hostDir = path.join(multiUserDir, "jesse", "paradise-park");
    mkdirSync(path.join(hostDir, "-Users-jesse--clank"), { recursive: true });
    writeFileSync(path.join(hostDir, "-Users-jesse--clank", "eee-555.jsonl"), '{"type":"user"}\n');
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"), "jesse", "paradise-park");
    const decoded = projects.find((p) => p.dirId.includes("-Users-jesse--clank"));
    expect(decoded).toBeDefined();
    expect(decoded!.name).toBe("clank");
  });

  it("uses prefix matching to extract last path component from encoded names", async () => {
    const hostDir = path.join(multiUserDir, "jesse", "paradise-park");
    // Add parent and child encoded dirs — prefix matching should detect
    // that -Users-jesse-prime-radiant is a prefix of -Users-jesse-prime-radiant-scribble
    mkdirSync(path.join(hostDir, "-Users-jesse-prime-radiant"), { recursive: true });
    writeFileSync(path.join(hostDir, "-Users-jesse-prime-radiant", "eee-555.jsonl"), '{"type":"user"}\n');
    mkdirSync(path.join(hostDir, "-Users-jesse-prime-radiant-scribble"), { recursive: true });
    writeFileSync(path.join(hostDir, "-Users-jesse-prime-radiant-scribble", "fff-666.jsonl"), '{"type":"user"}\n');
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"), "jesse", "paradise-park");
    const parent = projects.find((p) => p.dirId.includes("-Users-jesse-prime-radiant") && !p.dirId.includes("scribble"));
    expect(parent).toBeDefined();
    expect(parent!.name).toBe("prime-radiant");
    const child = projects.find((p) => p.dirId.includes("-Users-jesse-prime-radiant-scribble"));
    expect(child).toBeDefined();
    expect(child!.name).toBe("scribble");
  });

  it("uses prefix matching for deep paths like Documents-GitHub-lace", async () => {
    const hostDir = path.join(multiUserDir, "jesse", "paradise-park");
    mkdirSync(path.join(hostDir, "-Users-jesse-Documents-GitHub"), { recursive: true });
    writeFileSync(path.join(hostDir, "-Users-jesse-Documents-GitHub", "aaa-111.jsonl"), '{"type":"user"}\n');
    mkdirSync(path.join(hostDir, "-Users-jesse-Documents-GitHub-lace"), { recursive: true });
    writeFileSync(path.join(hostDir, "-Users-jesse-Documents-GitHub-lace", "bbb-222.jsonl"), '{"type":"user"}\n');
    const projects = await discoverUserProjects(path.join(multiUserDir, "jesse"), "jesse", "paradise-park");
    const parent = projects.find((p) => p.dirId.includes("-Users-jesse-Documents-GitHub") && !p.dirId.includes("lace"));
    expect(parent!.name).toBe("Documents-GitHub");
    const child = projects.find((p) => p.dirId.includes("-Users-jesse-Documents-GitHub-lace"));
    expect(child!.name).toBe("lace");
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
