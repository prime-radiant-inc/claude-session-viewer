import type { ParsedMessage, ContentBlock } from "~/lib/types";
import { formatModelName } from "~/lib/format";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";

function renderContentBlock(block: ContentBlock, index: number) {
  switch (block.type) {
    case "thinking":
      return <ThinkingBlock key={index} content={block.thinking} />;
    case "text":
      return (
        <div key={index} className="prose prose-sm max-w-none text-ink">
          {block.text.split("\n").map((line, i) => (
            <p key={i} className={line.trim() === "" ? "h-2" : ""}>{line}</p>
          ))}
        </div>
      );
    case "tool_use":
      return <ToolCallBlock key={index} name={block.name} id={block.id} input={block.input} />;
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

export function MessageBlock({ message }: { message: ParsedMessage }) {
  const isUser = message.type === "user";

  if (message.isToolResult) {
    return (
      <div className="pl-4 border-l-2 border-edge-light">
        {message.content.map((block, i) => renderContentBlock(block, i))}
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
      </div>

      {/* Content blocks */}
      <div className="space-y-2">
        {message.content.map((block, i) => renderContentBlock(block, i))}
      </div>
    </div>
  );
}
