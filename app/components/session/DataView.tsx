import { useState } from "react";
import { maskSecrets } from "~/lib/format";

function ExpandableString({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const display = expanded ? text : text.slice(0, 500);
  const canExpand = text.length > 500;
  const remainingLines = text.slice(500).split("\n").length;

  return (
    <span className="text-ink-light whitespace-pre-wrap break-words">
      {display}
      {canExpand && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="block text-teal hover:text-ink mt-1 cursor-pointer"
        >
          show {remainingLines.toLocaleString()} more lines
        </button>
      )}
      {canExpand && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="block text-teal hover:text-ink mt-1 cursor-pointer"
        >
          collapse
        </button>
      )}
    </span>
  );
}

function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-slate/60">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-teal">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-teal">{value}</span>;
  }
  if (typeof value === "string") {
    const masked = maskSecrets(value);
    if (masked.length > 120) {
      return <ExpandableString text={masked} />;
    }
    return <span className="text-ink-light break-words">{masked}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate/60">[]</span>;
    return (
      <div className={depth > 0 ? "ml-3" : ""}>
        {value.map((item, i) => (
          <div key={i} className="flex gap-1">
            <span className="text-slate/40 select-none shrink-0">{i}.</span>
            <div className="min-w-0">{renderValue(item, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-slate/60">{"{}"}</span>;
    return (
      <div className={depth > 0 ? "ml-3" : ""}>
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-1.5">
            <span className="text-slate font-medium shrink-0">{key}:</span>
            <div className="min-w-0">{renderValue(val, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export function DataView({ data }: { data: unknown }) {
  return (
    <div className="text-xs leading-relaxed">
      {renderValue(data)}
    </div>
  );
}
