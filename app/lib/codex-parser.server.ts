import { createReadStream } from "fs";
import { createInterface } from "readline";
import { access } from "fs/promises";
import type { ParsedMessage, ContentBlock } from "./types";

// Raw entry from a Codex JSONL file — each line has a top-level type + payload
export interface CodexRawEntry {
  timestamp: string;
  type: "session_meta" | "response_item" | "event_msg" | "turn_context" | "ghost_snapshot" | "turn_aborted";
  payload: Record<string, unknown>;
}

export interface CodexSessionMeta {
  sessionId: string;
  cwd: string;
  originator: string;
  gitBranch: string;
  model: string;
  firstPrompt: string;
  created: string;
  modified: string;
}

export async function parseCodexSessionFile(filePath: string): Promise<CodexRawEntry[]> {
  try {
    await access(filePath);
  } catch {
    return [];
  }

  const entries: CodexRawEntry[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as CodexRawEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

export function extractCodexMetadata(entries: CodexRawEntry[]): CodexSessionMeta {
  const meta: CodexSessionMeta = {
    sessionId: "",
    cwd: "",
    originator: "",
    gitBranch: "",
    model: "",
    firstPrompt: "",
    created: "",
    modified: "",
  };

  for (const entry of entries) {
    // Track first/last timestamps
    if (entry.timestamp) {
      if (!meta.created) meta.created = entry.timestamp;
      meta.modified = entry.timestamp;
    }

    if (entry.type === "session_meta") {
      const p = entry.payload;
      meta.sessionId = String(p.id || "");
      meta.cwd = String(p.cwd || "");
      meta.originator = String(p.originator || "");
      const git = p.git as Record<string, unknown> | undefined;
      if (git) {
        meta.gitBranch = String(git.branch || "");
      }
    }

    if (entry.type === "turn_context" && !meta.model) {
      meta.model = String(entry.payload.model || "");
    }

    if (entry.type === "event_msg" && entry.payload.type === "user_message" && !meta.firstPrompt) {
      meta.firstPrompt = String(entry.payload.message || "").slice(0, 200);
    }
  }

  return meta;
}

export function buildCodexMessages(entries: CodexRawEntry[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  let msgIndex = 0;

  // We accumulate assistant content blocks (thinking, tool_use, text) until a boundary.
  // A boundary is: a new user_message event, or a new assistant turn (agent_message).
  // Tool results become their own user-type messages.

  let currentAssistantBlocks: ContentBlock[] = [];
  let currentAssistantTimestamp = "";

  function flushAssistant() {
    if (currentAssistantBlocks.length === 0) return;
    messages.push({
      uuid: `codex-msg-${msgIndex++}`,
      parentUuid: null,
      type: "assistant",
      timestamp: currentAssistantTimestamp,
      content: currentAssistantBlocks,
      isSidechain: false,
    });
    currentAssistantBlocks = [];
    currentAssistantTimestamp = "";
  }

  for (const entry of entries) {
    const p = entry.payload;

    if (entry.type === "event_msg") {
      if (p.type === "user_message") {
        flushAssistant();
        messages.push({
          uuid: `codex-msg-${msgIndex++}`,
          parentUuid: null,
          type: "user",
          timestamp: entry.timestamp,
          content: [{ type: "text", text: String(p.message || "") }],
          isSidechain: false,
        });
      } else if (p.type === "agent_message") {
        // agent_message marks the final text of an assistant turn.
        // We accumulate it with any preceding reasoning/tool blocks.
        if (!currentAssistantTimestamp) {
          currentAssistantTimestamp = entry.timestamp;
        }
        currentAssistantBlocks.push({
          type: "text",
          text: String(p.message || ""),
        });
        flushAssistant();
      }
      // Skip token_count, agent_reasoning (we use response_item reasoning instead)
      continue;
    }

    if (entry.type === "response_item") {
      const itemType = p.type;

      // Skip all response_item messages — system context is filtered, and user/assistant
      // text is duplicated via event_msg (user_message / agent_message) which we use instead
      if (itemType === "message") continue;

      if (itemType === "reasoning") {
        if (!currentAssistantTimestamp) {
          currentAssistantTimestamp = entry.timestamp;
        }
        const summary = p.summary as Array<Record<string, unknown>> | undefined;
        const summaryText = summary
          ?.map((s) => String(s.text || ""))
          .filter(Boolean)
          .join("\n") || "";
        if (summaryText) {
          currentAssistantBlocks.push({
            type: "thinking",
            thinking: summaryText,
          });
        }
      } else if (itemType === "function_call") {
        if (!currentAssistantTimestamp) {
          currentAssistantTimestamp = entry.timestamp;
        }
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(String(p.arguments || "{}"));
        } catch {
          parsedArgs = { raw: String(p.arguments || "") };
        }
        currentAssistantBlocks.push({
          type: "tool_use",
          id: String(p.call_id || ""),
          name: String(p.name || ""),
          input: parsedArgs,
        });
      } else if (itemType === "function_call_output") {
        flushAssistant();
        const output = String(p.output || "");
        messages.push({
          uuid: `codex-msg-${msgIndex++}`,
          parentUuid: null,
          type: "user",
          timestamp: entry.timestamp,
          content: [{
            type: "tool_result",
            tool_use_id: String(p.call_id || ""),
            content: output,
          }],
          isSidechain: false,
          isToolResult: true,
          toolResultId: String(p.call_id || ""),
        });
      } else if (itemType === "custom_tool_call") {
        if (!currentAssistantTimestamp) {
          currentAssistantTimestamp = entry.timestamp;
        }
        const name = String(p.name || "");
        const input: Record<string, unknown> = name === "apply_patch"
          ? { patch: String(p.input || "") }
          : { input: String(p.input || "") };
        currentAssistantBlocks.push({
          type: "tool_use",
          id: String(p.call_id || ""),
          name,
          input,
        });
      } else if (itemType === "custom_tool_call_output") {
        flushAssistant();
        const output = String(p.output || "");
        messages.push({
          uuid: `codex-msg-${msgIndex++}`,
          parentUuid: null,
          type: "user",
          timestamp: entry.timestamp,
          content: [{
            type: "tool_result",
            tool_use_id: String(p.call_id || ""),
            content: output,
          }],
          isSidechain: false,
          isToolResult: true,
          toolResultId: String(p.call_id || ""),
        });
      }
      // Skip response_item type=message for user/assistant (we use event_msg instead)
    }

    // Skip turn_context, ghost_snapshot, turn_aborted
  }

  // Flush any remaining assistant content
  flushAssistant();

  return messages;
}
