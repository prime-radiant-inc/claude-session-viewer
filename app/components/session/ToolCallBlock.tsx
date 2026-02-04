import { getToolPreview } from "~/lib/format";

export function ToolCallBlock({ name, id, input }: { name: string; id: string; input: Record<string, unknown> }) {
  const preview = getToolPreview(name, input);

  return (
    <details className="group">
      <summary className="text-xs text-slate cursor-pointer hover:text-ink select-none">
        <span className="font-medium text-ink-light">{name}</span>
        {preview && <span className="ml-1.5 text-slate">{preview}</span>}
      </summary>
      <pre className="mt-1 text-xs bg-panel p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
        {JSON.stringify(input, null, 2)}
      </pre>
    </details>
  );
}
