import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ParsedMessage, ContentBlock } from "~/lib/types";
import { formatModelName } from "~/lib/format";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { SubagentPanel } from "./SubagentPanel";

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface SubagentContext {
  subagentMap: Record<string, string>;
  projectId: string;
  sessionId: string;
}

function renderContentBlock(block: ContentBlock, index: number, subagentCtx?: SubagentContext) {
  switch (block.type) {
    case "thinking":
      return <ThinkingBlock key={index} content={block.thinking} />;
    case "text":
      return (
        <div key={index} className="prose prose-sm max-w-none text-ink">
          <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
        </div>
      );
    case "tool_use": {
      const agentId = block.name === "Task" && subagentCtx
        ? subagentCtx.subagentMap[block.id]
        : undefined;
      return (
        <div key={index}>
          <ToolCallBlock name={block.name} id={block.id} input={block.input} />
          {agentId && subagentCtx && (
            <SubagentPanel
              projectId={subagentCtx.projectId}
              sessionId={subagentCtx.sessionId}
              agentId={agentId}
              description={String((block.input as Record<string, unknown>).description || "")}
            />
          )}
        </div>
      );
    }
    case "tool_result":
      return (
        <details key={index} className="group">
          <summary className="text-xs text-slate cursor-pointer hover:text-ink select-none">
            Tool result {block.is_error ? "(error)" : ""}
          </summary>
          <pre className="mt-1 text-xs bg-panel p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
            {typeof block.content === "string"
              ? block.content.slice(0, 2000)
              : JSON.stringify(block.content, null, 2).slice(0, 2000)}
          </pre>
        </details>
      );
    default:
      return null;
  }
}

interface MessageBlockProps {
  message: ParsedMessage;
  subagentMap?: Record<string, string>;
  projectId?: string;
  sessionId?: string;
}

export function MessageBlock({ message, subagentMap, projectId, sessionId }: MessageBlockProps) {
  const isUser = message.type === "user";

  const subagentCtx = subagentMap && projectId && sessionId
    ? { subagentMap, projectId, sessionId }
    : undefined;

  if (message.isToolResult) {
    return (
      <div className="pl-4 border-l-2 border-edge-light">
        {message.content.map((block, i) => renderContentBlock(block, i, subagentCtx))}
      </div>
    );
  }

  return (
    <div className={isUser ? "" : "pl-4 border-l-2 border-teal-light"}>
      {/* Role label */}
      <div className="flex items-center gap-2 mb-1">
        <span className="section-label">{isUser ? "You" : "Assistant"}</span>
        {!isUser && message.model && (
          <span className="text-xs text-slate">
            {formatModelName(message.model)}
          </span>
        )}
        {message.timestamp && (
          <span className="text-xs text-slate ml-auto">{formatTimestamp(message.timestamp)}</span>
        )}
      </div>

      {/* Content blocks */}
      <div className="space-y-2">
        {message.content.map((block, i) => renderContentBlock(block, i, subagentCtx))}
      </div>
    </div>
  );
}
