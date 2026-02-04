export function getToolPreview(name: string, input: Record<string, unknown>): string {
  if (name === "Read" && input.file_path) return String(input.file_path);
  if (name === "Write" && input.file_path) return String(input.file_path);
  if (name === "Edit" && input.file_path) return String(input.file_path);
  if (name === "Bash" && input.command) return String(input.command).slice(0, 80);
  if (name === "Glob" && input.pattern) return String(input.pattern);
  if (name === "Grep" && input.pattern) return String(input.pattern);
  if (name === "Task" && input.description) return String(input.description);
  if (name === "WebFetch" && input.url) return String(input.url);
  return "";
}

export function formatModelName(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "");
}
