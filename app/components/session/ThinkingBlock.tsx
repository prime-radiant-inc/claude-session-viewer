export function ThinkingBlock({ content }: { content: string }) {
  return (
    <details className="group">
      <summary className="text-xs text-slate cursor-pointer hover:text-ink select-none">
        Thinking...
      </summary>
      <div className="mt-1 text-xs text-slate bg-panel p-3 rounded max-h-96 overflow-y-auto whitespace-pre-wrap">
        {content}
      </div>
    </details>
  );
}
