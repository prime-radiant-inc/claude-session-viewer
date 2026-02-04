import { describe, it, expect } from "vitest";
import type { RawLogEntry, SessionsIndexEntry } from "~/lib/types";

describe("types", () => {
  it("RawLogEntry accepts a user message", () => {
    const entry: RawLogEntry = {
      type: "user",
      uuid: "abc-123",
      parentUuid: null,
      sessionId: "session-1",
      timestamp: "2026-01-21T23:26:32.460Z",
      isSidechain: false,
      message: { role: "user", content: "hello world" },
    };
    expect(entry.type).toBe("user");
  });

  it("RawLogEntry accepts an assistant message with tool_use", () => {
    const entry: RawLogEntry = {
      type: "assistant",
      uuid: "abc-456",
      parentUuid: "abc-123",
      sessionId: "session-1",
      timestamp: "2026-01-21T23:26:35Z",
      isSidechain: false,
      message: {
        role: "assistant",
        model: "claude-opus-4-5-20251101",
        content: [
          { type: "thinking", thinking: "Let me think...", signature: "sig" },
          { type: "tool_use", id: "toolu_01X", name: "Read", input: { file_path: "/tmp/test" } },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    expect(entry.type).toBe("assistant");
  });

  it("RawLogEntry accepts a summary", () => {
    const entry: RawLogEntry = { type: "summary", summary: "Fixed the bug", leafUuid: "abc-789" };
    expect(entry.summary).toBe("Fixed the bug");
  });

  it("SessionsIndexEntry matches index file shape", () => {
    const entry: SessionsIndexEntry = {
      sessionId: "860e0e2a",
      fullPath: "/path/to/860e0e2a.jsonl",
      firstPrompt: "hello",
      summary: "User logged in",
      messageCount: 2,
      created: "2026-01-21T17:30:38Z",
      modified: "2026-01-21T17:30:38Z",
      gitBranch: "",
      projectPath: "/Users/jesse/prime-radiant",
      isSidechain: false,
    };
    expect(entry.sessionId).toBeTruthy();
  });
});
