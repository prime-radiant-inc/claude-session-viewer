import { createReadStream } from "fs";
import { createInterface } from "readline";
import { access } from "fs/promises";
import type { RawLogEntry, ParsedMessage, ContentBlock } from "./types";

export async function parseSessionFile(filePath: string): Promise<RawLogEntry[]> {
  try {
    await access(filePath);
  } catch {
    return [];
  }

  const entries: RawLogEntry[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as RawLogEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

export function buildConversationThread(entries: RawLogEntry[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const entry of entries) {
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (!entry.uuid || !entry.message) continue;
    if (entry.isMeta) continue;

    const content = normalizeContent(entry.message.content);

    const toolResultBlock = content.find((b) => b.type === "tool_result");
    const isToolResult = !!toolResultBlock;
    const toolResultId = toolResultBlock?.type === "tool_result" ? toolResultBlock.tool_use_id : undefined;
    const isError = toolResultBlock?.type === "tool_result" ? toolResultBlock.is_error ?? false : undefined;

    let subagentId: string | undefined;
    let subagentDescription: string | undefined;
    for (const block of content) {
      if (block.type === "tool_use" && block.name === "Task") {
        subagentId = block.id;
        subagentDescription = (block.input as Record<string, unknown>).description as string | undefined;
      }
    }

    messages.push({
      uuid: entry.uuid,
      parentUuid: entry.parentUuid ?? null,
      type: entry.type,
      timestamp: entry.timestamp ?? "",
      content,
      model: entry.message.model,
      usage: entry.message.usage,
      isSidechain: entry.isSidechain ?? false,
      isToolResult,
      toolResultId,
      isError,
      subagentId,
      subagentDescription,
    });
  }

  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return messages;
}

function normalizeContent(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

export function extractSummary(entries: RawLogEntry[]): string | undefined {
  return entries.findLast((e) => e.type === "summary")?.summary;
}

export function extractFirstPrompt(entries: RawLogEntry[]): string {
  for (const entry of entries) {
    if (entry.type !== "user" || entry.isMeta) continue;
    const content = entry.message?.content;
    if (typeof content === "string") return content.slice(0, 200);
    if (Array.isArray(content)) {
      const text = content.find((b) => b.type === "text");
      if (text?.type === "text") return text.text.slice(0, 200);
    }
  }
  return "No prompt";
}
