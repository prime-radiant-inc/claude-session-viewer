import { describe, it, expect } from "vitest";
import { getToolPreview, formatModelName } from "~/lib/format";

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
