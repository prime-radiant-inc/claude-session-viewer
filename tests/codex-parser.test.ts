import { describe, it, expect } from "vitest";
import { parseCodexSessionFile, extractCodexMetadata, buildCodexMessages } from "~/lib/codex-parser.server";
import path from "path";

const FIXTURES = path.resolve(__dirname, "fixtures");
const CODEX_SESSION = path.join(FIXTURES, "codex-session.jsonl");
const CODEX_EXEC_SESSION = path.join(FIXTURES, "codex-exec-session.jsonl");

describe("parseCodexSessionFile", () => {
  it("parses all entries from a JSONL file", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("returns empty array for nonexistent file", async () => {
    const entries = await parseCodexSessionFile("/nonexistent/file.jsonl");
    expect(entries).toEqual([]);
  });

  it("preserves entry types and payloads", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = entries.find((e) => e.type === "session_meta");
    expect(meta).toBeDefined();
    expect(meta!.payload).toBeDefined();
  });
});

describe("extractCodexMetadata", () => {
  it("extracts session ID from session_meta", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.sessionId).toBe("019c2286-484a-7550-b53b-cd4e1fd7c5e4");
  });

  it("extracts cwd from session_meta", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.cwd).toBe("/Users/jesse/my-project");
  });

  it("extracts originator from session_meta", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.originator).toBe("codex_cli_rs");
  });

  it("extracts git info from session_meta", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.gitBranch).toBe("main");
  });

  it("extracts model from turn_context", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.model).toBe("gpt-5.2-codex");
  });

  it("extracts first user prompt from event_msg", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.firstPrompt).toBe("Fix the login bug in auth.ts");
  });

  it("extracts timestamps from entries", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.created).toBe("2026-02-03T08:02:31.655Z");
    expect(meta.modified).toBe("2026-02-03T08:03:15.500Z");
  });

  it("identifies codex_exec originator", async () => {
    const entries = await parseCodexSessionFile(CODEX_EXEC_SESSION);
    const meta = extractCodexMetadata(entries);
    expect(meta.originator).toBe("codex_exec");
  });
});

describe("buildCodexMessages", () => {
  it("converts user_message events to ParsedMessages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const userMsgs = messages.filter((m) => m.type === "user" && !m.isToolResult);
    expect(userMsgs.length).toBe(2);
    expect(userMsgs[0].content[0]).toEqual({ type: "text", text: "Fix the login bug in auth.ts" });
    expect(userMsgs[1].content[0]).toEqual({ type: "text", text: "Thanks, can you also add a test?" });
  });

  it("converts agent_message events to assistant ParsedMessages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const assistantMsgs = messages.filter((m) => m.type === "assistant");
    // Assistant messages get split at tool result boundaries:
    // 1: reasoning + function_call (exec_command)
    // 2: custom_tool_call (apply_patch)
    // 3: agent_message text (first response)
    // 4: reasoning + agent_message text (second response)
    expect(assistantMsgs.length).toBe(4);
    // Last two should have text content (the agent_message text)
    expect(assistantMsgs[2].content.some((b) => b.type === "text")).toBe(true);
    expect(assistantMsgs[3].content.some((b) => b.type === "text")).toBe(true);
  });

  it("attaches reasoning as thinking blocks on assistant messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const assistantMsgs = messages.filter((m) => m.type === "assistant");
    // First assistant message should have a thinking block from the reasoning entry
    const thinkingBlocks = assistantMsgs[0].content.filter((b) => b.type === "thinking");
    expect(thinkingBlocks.length).toBe(1);
    if (thinkingBlocks[0].type === "thinking") {
      expect(thinkingBlocks[0].thinking).toContain("Analyzing the auth.ts file");
    }
  });

  it("converts function_call to tool_use blocks on assistant messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const assistantMsgs = messages.filter((m) => m.type === "assistant");
    const toolUseBlocks = assistantMsgs[0].content.filter((b) => b.type === "tool_use");
    expect(toolUseBlocks.length).toBeGreaterThanOrEqual(1);
    const shellCall = toolUseBlocks.find(
      (b) => b.type === "tool_use" && b.name === "exec_command",
    );
    expect(shellCall).toBeDefined();
    if (shellCall?.type === "tool_use") {
      expect(shellCall.id).toBe("call_abc123");
      expect(shellCall.input).toEqual({ cmd: "cat auth.ts", workdir: "/Users/jesse/my-project" });
    }
  });

  it("converts function_call_output to tool_result messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const toolResults = messages.filter((m) => m.isToolResult);
    expect(toolResults.length).toBeGreaterThanOrEqual(1);
    const shellResult = toolResults.find((m) => m.toolResultId === "call_abc123");
    expect(shellResult).toBeDefined();
    expect(shellResult!.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call_abc123",
    });
  });

  it("converts custom_tool_call (apply_patch) to tool_use blocks", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const assistantMsgs = messages.filter((m) => m.type === "assistant");
    // apply_patch is in the second assistant message (after the first tool result split)
    const patchCall = assistantMsgs[1].content.find(
      (b) => b.type === "tool_use" && b.name === "apply_patch",
    );
    expect(patchCall).toBeDefined();
    if (patchCall?.type === "tool_use") {
      expect(patchCall.id).toBe("call_def456");
      expect(patchCall.input.patch).toContain("*** Begin Patch");
    }
  });

  it("converts custom_tool_call_output to tool_result messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const patchResult = messages.find((m) => m.isToolResult && m.toolResultId === "call_def456");
    expect(patchResult).toBeDefined();
  });

  it("filters out developer role messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    // No messages should contain developer/system instruction content
    const allText = messages.flatMap((m) => m.content)
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join(" ");
    expect(allText).not.toContain("permissions instructions");
  });

  it("filters out AGENTS.md and environment_context messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    const allText = messages.flatMap((m) => m.content)
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join(" ");
    expect(allText).not.toContain("AGENTS.md");
    expect(allText).not.toContain("environment_context");
    expect(allText).not.toContain("user_instructions");
  });

  it("generates synthetic UUIDs for messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    for (const msg of messages) {
      expect(msg.uuid).toMatch(/^codex-msg-\d+$/);
    }
  });

  it("has null parentUuid (linear conversation)", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    for (const msg of messages) {
      expect(msg.parentUuid).toBeNull();
    }
  });

  it("sets isSidechain to false for all messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    for (const msg of messages) {
      expect(msg.isSidechain).toBe(false);
    }
  });

  it("preserves timestamps on messages", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    for (const msg of messages) {
      expect(msg.timestamp).toBeTruthy();
    }
  });

  it("orders messages chronologically", async () => {
    const entries = await parseCodexSessionFile(CODEX_SESSION);
    const messages = buildCodexMessages(entries);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].timestamp >= messages[i - 1].timestamp).toBe(true);
    }
  });
});
