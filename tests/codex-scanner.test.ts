import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { discoverCodexSessions } from "~/lib/codex-scanner.server";

let codexDir: string;

beforeEach(() => {
  codexDir = mkdtempSync(path.join(tmpdir(), "se-codex-scan-"));
  // Create year/month/day structure with session files
  const day1 = path.join(codexDir, "sessions", "2026", "02", "03");
  const day2 = path.join(codexDir, "sessions", "2026", "02", "04");
  mkdirSync(day1, { recursive: true });
  mkdirSync(day2, { recursive: true });

  writeFileSync(
    path.join(day1, "rollout-2026-02-03T00-02-31-019c2286-484a-7550-b53b-cd4e1fd7c5e4.jsonl"),
    '{"timestamp":"2026-02-03T08:02:31.655Z","type":"session_meta","payload":{"id":"019c2286-484a-7550-b53b-cd4e1fd7c5e4"}}\n',
  );
  writeFileSync(
    path.join(day2, "rollout-2026-02-04T15-42-54-019c2b09-9611-70a1-86f0-18a64728f0f6.jsonl"),
    '{"timestamp":"2026-02-04T23:43:07.149Z","type":"session_meta","payload":{"id":"019c2b09-9611-70a1-86f0-18a64728f0f6"}}\n',
  );

  // A non-JSONL file that should be ignored
  writeFileSync(path.join(day1, "notes.txt"), "not a session\n");
});

afterEach(() => {
  rmSync(codexDir, { recursive: true, force: true });
});

describe("discoverCodexSessions", () => {
  it("discovers JSONL files in year/month/day structure", async () => {
    const sessions = await discoverCodexSessions(codexDir);
    expect(sessions.length).toBe(2);
  });

  it("extracts session ID from filename", async () => {
    const sessions = await discoverCodexSessions(codexDir);
    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual([
      "019c2286-484a-7550-b53b-cd4e1fd7c5e4",
      "019c2b09-9611-70a1-86f0-18a64728f0f6",
    ]);
  });

  it("returns full file paths", async () => {
    const sessions = await discoverCodexSessions(codexDir);
    for (const s of sessions) {
      expect(s.filePath).toContain("rollout-");
      expect(s.filePath.endsWith(".jsonl")).toBe(true);
    }
  });

  it("returns file mtime", async () => {
    const sessions = await discoverCodexSessions(codexDir);
    for (const s of sessions) {
      expect(s.mtime).toBeInstanceOf(Date);
    }
  });

  it("ignores non-JSONL files", async () => {
    const sessions = await discoverCodexSessions(codexDir);
    const paths = sessions.map((s) => s.filePath);
    expect(paths.every((p) => p.endsWith(".jsonl"))).toBe(true);
  });

  it("returns empty for nonexistent directory", async () => {
    const sessions = await discoverCodexSessions("/nonexistent/path");
    expect(sessions).toEqual([]);
  });

  it("returns empty when sessions directory is missing", async () => {
    const emptyDir = mkdtempSync(path.join(tmpdir(), "se-codex-empty-"));
    try {
      const sessions = await discoverCodexSessions(emptyDir);
      expect(sessions).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
