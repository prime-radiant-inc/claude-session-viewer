import { useState } from "react";
import type { ParsedMessage } from "~/lib/types";
import { MessageBlock } from "./MessageBlock";

interface SubagentPanelProps {
  projectId: string;
  sessionId: string;
  agentId: string;
  description?: string;
}

export function SubagentPanel({ projectId, sessionId, agentId, description }: SubagentPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ParsedMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (messages) return; // Already loaded

    setLoading(true);
    try {
      const res = await fetch(`/api/subagent/${projectId}/${sessionId}/${agentId}`);
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
    <div className="border-l-2 border-teal-light pl-4 my-2">
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
          {messages && messages.map((msg) => (
            <MessageBlock key={msg.uuid} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}
