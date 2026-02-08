const SECRET_PATTERNS: Array<{ pattern: RegExp; prefixLen: number }> = [
  { pattern: /sk-ant-\S+/g, prefixLen: 6 },
  { pattern: /sk-[A-Za-z0-9\-]{20,}/g, prefixLen: 6 },
  { pattern: /AKIA[A-Z0-9]{16}/g, prefixLen: 6 },
  { pattern: /Bearer\s+[A-Za-z0-9._\-]{10,}/g, prefixLen: 13 }, // "Bearer " (7) + 6 chars
  { pattern: /xox[bpras]-[A-Za-z0-9\-]+/g, prefixLen: 6 },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, prefixLen: 6 },
  { pattern: /gho_[A-Za-z0-9]{36}/g, prefixLen: 6 },
];

export function maskSecrets(text: string): string {
  let result = text;
  for (const { pattern, prefixLen } of SECRET_PATTERNS) {
    // Reset lastIndex since we reuse the regex
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) =>
      match.slice(0, prefixLen) + "...MASKED",
    );
  }
  return result;
}

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
