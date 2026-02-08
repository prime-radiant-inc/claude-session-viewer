import { getToolPreview } from "~/lib/format";
import { DataView } from "./DataView";
import { DiffView } from "./DiffView";

export function ToolCallBlock({ name, id, input }: { name: string; id: string; input: Record<string, unknown> }) {
  const preview = getToolPreview(name, input);
  const isEdit = name === "Edit" && typeof input.old_string === "string" && typeof input.new_string === "string";

  return (
    <details className="group">
      <summary className="text-xs text-slate cursor-pointer hover:text-ink select-none">
        <span className="font-medium text-ink-light">{name}</span>
        {preview && <span className="ml-1.5 text-slate">{preview}</span>}
      </summary>
      <div className="mt-1 p-2 bg-panel/50 rounded-lg">
        {isEdit ? (
          <DiffView
            filePath={String(input.file_path || "")}
            oldString={String(input.old_string)}
            newString={String(input.new_string)}
          />
        ) : (
          <DataView data={input} />
        )}
      </div>
    </details>
  );
}
