import { describe, it, expect } from "vitest";
import { getToolPreview, formatModelName, maskSecrets } from "~/lib/format";

describe("getToolPreview", () => {
  it("returns file_path for Read tool", () => {
    expect(getToolPreview("Read", { file_path: "/tmp/test.txt" })).toBe("/tmp/test.txt");
  });

  it("returns file_path for Write tool", () => {
    expect(getToolPreview("Write", { file_path: "/tmp/out.txt", content: "stuff" })).toBe("/tmp/out.txt");
  });

  it("returns file_path for Edit tool", () => {
    expect(getToolPreview("Edit", { file_path: "/src/main.ts" })).toBe("/src/main.ts");
  });

  it("returns truncated command for Bash tool", () => {
    const longCmd = "a".repeat(120);
    expect(getToolPreview("Bash", { command: longCmd })).toBe("a".repeat(80));
  });

  it("returns short command as-is for Bash tool", () => {
    expect(getToolPreview("Bash", { command: "ls -la" })).toBe("ls -la");
  });

  it("returns pattern for Glob tool", () => {
    expect(getToolPreview("Glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
  });

  it("returns pattern for Grep tool", () => {
    expect(getToolPreview("Grep", { pattern: "TODO" })).toBe("TODO");
  });

  it("returns description for Task tool", () => {
    expect(getToolPreview("Task", { description: "Run tests" })).toBe("Run tests");
  });

  it("returns url for WebFetch tool", () => {
    expect(getToolPreview("WebFetch", { url: "https://example.com" })).toBe("https://example.com");
  });

  it("returns empty string for unknown tool", () => {
    expect(getToolPreview("UnknownTool", { foo: "bar" })).toBe("");
  });

  it("returns empty string when expected key is missing", () => {
    expect(getToolPreview("Read", {})).toBe("");
    expect(getToolPreview("Bash", {})).toBe("");
  });
});

describe("maskSecrets", () => {
  it("masks Anthropic API keys", () => {
    const text = "key: sk-ant-api03-abcdef1234567890abcdef1234567890";
    expect(maskSecrets(text)).toBe("key: sk-ant...MASKED");
  });

  it("masks OpenAI API keys", () => {
    const text = "key: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890";
    expect(maskSecrets(text)).toBe("key: sk-pro...MASKED");
  });

  it("masks AWS access key IDs", () => {
    const text = "aws_access_key_id=AKIAIOSFODNN7EXAMPLE";
    expect(maskSecrets(text)).toBe("aws_access_key_id=AKIAIO...MASKED");
  });

  it("masks Bearer tokens, keeping prefix visible", () => {
    const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
    expect(maskSecrets(text)).toBe("Authorization: Bearer eyJhbG...MASKED");
  });

  it("masks Slack bot tokens", () => {
    const text = "token: xoxb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUv";
    expect(maskSecrets(text)).toBe("token: xoxb-1...MASKED");
  });

  it("masks Slack user tokens", () => {
    const text = "token: xoxp-123456789012-1234567890123-AbCdEfGh";
    expect(maskSecrets(text)).toBe("token: xoxp-1...MASKED");
  });

  it("masks GitHub personal access tokens", () => {
    const text = "token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    expect(maskSecrets(text)).toBe("token: ghp_AB...MASKED");
  });

  it("masks GitHub OAuth tokens", () => {
    const text = "token: gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    expect(maskSecrets(text)).toBe("token: gho_AB...MASKED");
  });

  it("masks multiple secrets in the same text", () => {
    const text = "key1: sk-ant-api03-abc123def456 key2: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const result = maskSecrets(text);
    expect(result).toContain("sk-ant...MASKED");
    expect(result).toContain("ghp_AB...MASKED");
  });

  it("returns text unchanged when no secrets present", () => {
    const text = "Just a normal log message with no secrets";
    expect(maskSecrets(text)).toBe(text);
  });

  it("does not mask short strings that happen to start with sk-", () => {
    const text = "sk-short";
    expect(maskSecrets(text)).toBe("sk-short");
  });
});

describe("formatModelName", () => {
  it("strips claude- prefix and date suffix", () => {
    expect(formatModelName("claude-opus-4-5-20251101")).toBe("opus-4-5");
  });

  it("strips claude- prefix and date suffix for sonnet", () => {
    expect(formatModelName("claude-sonnet-4-20250514")).toBe("sonnet-4");
  });

  it("handles model without claude- prefix", () => {
    expect(formatModelName("opus-4-5-20251101")).toBe("opus-4-5");
  });

  it("handles model without date suffix", () => {
    expect(formatModelName("claude-opus-4-5")).toBe("opus-4-5");
  });

  it("returns the name as-is if no patterns match", () => {
    expect(formatModelName("gpt-4")).toBe("gpt-4");
  });
});
