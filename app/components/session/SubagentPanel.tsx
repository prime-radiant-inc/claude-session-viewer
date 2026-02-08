import { useState, useMemo } from "react";
import type { ParsedMessage, ContentBlock } from "~/lib/types";
import type { ToolResultEntry } from "./InfiniteMessageList";
import { MessageBlock } from "./MessageBlock";

interface SubagentPanelProps {
  sessionId: string;
  agentId: string;
  description?: string;
}

export function SubagentPanel({ sessionId, agentId, description }: SubagentPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ParsedMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build tool result map and continuation flags for subagent messages
  const { toolResultMap, consumedUuids, continuationFlags } = useMemo(() => {
    if (!messages) return { toolResultMap: new Map<string, ToolResultEntry>(), consumedUuids: new Set<string>(), continuationFlags: [] as boolean[] };

    const map = new Map<string, ToolResultEntry>();
    const consumed = new Set<string>();
    for (const msg of messages) {
      if (!msg.isToolResult) continue;
      let allConsumed = true;
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          map.set(block.tool_use_id, {
            content: block.content as string | ContentBlock[],
            isError: block.is_error ?? false,
          });
        } else {
          allConsumed = false;
        }
      }
      if (allConsumed) consumed.add(msg.uuid);
    }

    const flags: boolean[] = new Array(messages.length).fill(false);
    const first = messages[0];
    let expectAssistantHeader = first?.type === "user" && !first?.isToolResult;
    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];
      const isRealUserMessage = msg.type === "user" && !msg.isToolResult;
      if (isRealUserMessage) {
        flags[i] = false;
        expectAssistantHeader = true;
      } else if (expectAssistantHeader && msg.type === "assistant") {
        flags[i] = false;
        expectAssistantHeader = false;
      } else {
        flags[i] = true;
      }
    }

    return { toolResultMap: map, consumedUuids: consumed, continuationFlags: flags };
  }, [messages]);

  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (messages) return; // Already loaded

    setLoading(true);
    try {
      const res = await fetch(`/api/subagent/${sessionId}/${agentId}`);
      if (!res.ok) throw new Error("Failed to load subagent");
      const data = await res.json();
      setMessages(data.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="my-2 ml-4 bg-teal-wash/30 rounded-lg px-3 py-2">
      <button
        onClick={handleToggle}
        className="text-xs text-teal hover:text-ink cursor-pointer select-none flex items-center gap-1"
      >
        <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>&#9654;</span>
        <span className="font-medium">Subagent</span>
        {description && <span className="text-slate ml-1">{description}</span>}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {loading && <p className="text-xs text-slate">Loading subagent conversation...</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {messages && messages.map((msg, i) => (
            <MessageBlock
              key={msg.uuid}
              message={msg}
              isContinuation={continuationFlags[i]}
              isConsumedToolResult={consumedUuids.has(msg.uuid)}
              toolResultMap={toolResultMap}
              sessionId={sessionId}
              userName="Agent"
              assistantLabel="Subagent"
            />
          ))}
        </div>
      )}
    </div>
  );
}
