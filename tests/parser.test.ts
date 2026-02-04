import { describe, it, expect } from "vitest";
import { parseSessionFile, buildConversationThread, extractSummary, extractFirstPrompt } from "~/lib/parser.server";
import path from "path";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("parseSessionFile", () => {
  it("parses a simple session into entries", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    expect(entries.length).toBe(4);
    expect(entries[0].type).toBe("user");
    expect(entries[1].type).toBe("assistant");
    expect(entries[2].type).toBe("system");
    expect(entries[3].type).toBe("summary");
  });

  it("returns empty array for nonexistent file", async () => {
    const entries = await parseSessionFile("/nonexistent/file.jsonl");
    expect(entries).toEqual([]);
  });
});

describe("buildConversationThread", () => {
  it("filters to user/assistant messages and orders by timestamp", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread.length).toBe(2);
    expect(thread[0].type).toBe("user");
    expect(thread[1].type).toBe("assistant");
  });

  it("extracts text content from user messages", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    const textBlock = thread[0].content.find((b) => b.type === "text");
    expect(textBlock).toBeDefined();
    if (textBlock?.type === "text") expect(textBlock.text).toBe("What is 2+2?");
  });

  it("preserves thinking and text blocks in assistant messages", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread[1].content.length).toBe(2);
    expect(thread[1].content[0].type).toBe("thinking");
    expect(thread[1].content[1].type).toBe("text");
  });

  it("pairs tool_use with tool_result", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "tool-use-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread.length).toBe(4);
    expect(thread[1].content.some((b) => b.type === "tool_use")).toBe(true);
    expect(thread[2].isToolResult).toBe(true);
    expect(thread[2].toolResultId).toBe("toolu_01X");
  });

  it("identifies subagent dispatches", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "subagent-session.jsonl"));
    const thread = buildConversationThread(entries);
    const dispatch = thread.find((m) => m.subagentId);
    expect(dispatch).toBeDefined();
    expect(dispatch?.subagentDescription).toBe("Explore codebase structure");
  });

  it("includes token usage and model on assistant messages", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread[1].usage?.input_tokens).toBe(10);
    expect(thread[1].model).toBe("claude-opus-4-5-20251101");
  });
});

describe("extractSummary", () => {
  it("returns summary text from a session with a summary entry", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    expect(extractSummary(entries)).toBe("Simple math question");
  });

  it("returns undefined when no summary entry exists", () => {
    expect(extractSummary([])).toBeUndefined();
  });
});

describe("extractFirstPrompt", () => {
  it("returns the first user message text", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    expect(extractFirstPrompt(entries)).toBe("What is 2+2?");
  });

  it("returns first prompt from tool-use session with string content", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "tool-use-session.jsonl"));
    expect(extractFirstPrompt(entries)).toBe("Read the file /tmp/test.txt");
  });

  it("returns 'No prompt' for empty entries", () => {
    expect(extractFirstPrompt([])).toBe("No prompt");
  });
});
