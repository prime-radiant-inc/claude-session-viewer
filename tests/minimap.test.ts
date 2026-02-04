import { describe, it, expect } from "vitest";
import { estimateContentLength, computeBarHeights, hitTestMessageIndex, computeBranchLayout } from "~/lib/minimap";

describe("estimateContentLength", () => {
  it("sums text block lengths", () => {
    expect(estimateContentLength([
      { type: "text", text: "hello world" },
    ])).toBe(11);
  });

  it("sums thinking block lengths", () => {
    expect(estimateContentLength([
      { type: "thinking", thinking: "let me think" },
    ])).toBe(12);
  });

  it("sums tool_use input as JSON", () => {
    const blocks = [{ type: "tool_use" as const, id: "t1", name: "Read", input: { file_path: "/tmp/test" } }];
    const result = estimateContentLength(blocks);
    expect(result).toBe(JSON.stringify({ file_path: "/tmp/test" }).length);
  });

  it("sums tool_result string content", () => {
    expect(estimateContentLength([
      { type: "tool_result", tool_use_id: "t1", content: "file contents here" },
    ])).toBe(18);
  });

  it("sums multiple blocks", () => {
    const result = estimateContentLength([
      { type: "text", text: "hello" },
      { type: "thinking", thinking: "hmm" },
    ]);
    expect(result).toBe(8);
  });

  it("returns 0 for empty array", () => {
    expect(estimateContentLength([])).toBe(0);
  });
});

describe("computeBarHeights", () => {
  it("distributes heights proportionally", () => {
    const heights = computeBarHeights([100, 100], 200, 2);
    expect(heights).toEqual([100, 100]);
  });

  it("enforces minimum bar height", () => {
    const heights = computeBarHeights([1, 1000], 100, 5);
    expect(heights[0]).toBeGreaterThanOrEqual(5);
    expect(heights[1]).toBeGreaterThanOrEqual(5);
    expect(Math.round(heights.reduce((a, b) => a + b, 0))).toBe(100);
  });

  it("handles all equal lengths", () => {
    const heights = computeBarHeights([50, 50, 50, 50], 400, 2);
    expect(heights).toEqual([100, 100, 100, 100]);
  });

  it("returns empty for empty input", () => {
    expect(computeBarHeights([], 100, 2)).toEqual([]);
  });

  it("handles single message", () => {
    const heights = computeBarHeights([100], 500, 2);
    expect(heights).toEqual([500]);
  });
});

describe("hitTestMessageIndex", () => {
  it("returns index of clicked bar", () => {
    const heights = [50, 50, 50];
    expect(hitTestMessageIndex(25, heights)).toBe(0);
    expect(hitTestMessageIndex(75, heights)).toBe(1);
    expect(hitTestMessageIndex(125, heights)).toBe(2);
  });

  it("clamps to last index for click past end", () => {
    expect(hitTestMessageIndex(999, [50, 50])).toBe(1);
  });

  it("returns 0 for click at very top", () => {
    expect(hitTestMessageIndex(0, [50, 50])).toBe(0);
  });

  it("returns 0 for empty heights", () => {
    expect(hitTestMessageIndex(50, [])).toBe(0);
  });
});

describe("computeBranchLayout", () => {
  it("returns empty for no branch points", () => {
    expect(computeBranchLayout([100, 100], [])).toEqual([]);
  });

  it("calculates fork fraction correctly", () => {
    const mainHeights = [100, 100, 100]; // fork at index 1 = after 200/300 = 0.667
    const branches = computeBranchLayout(mainHeights, [{
      messageIndex: 1,
      forkMessageUuid: "a1",
      paths: [
        [{ type: "user", content: [{ type: "text", text: "active" }] }],
        [{ type: "user", content: [{ type: "text", text: "alt" }] }],
      ],
    }]);
    expect(branches.length).toBe(1);
    expect(branches[0].forkFraction).toBeCloseTo(0.667, 2);
  });

  it("skips path 0 (active path)", () => {
    const branches = computeBranchLayout([100, 100], [{
      messageIndex: 0,
      forkMessageUuid: "a1",
      paths: [
        [{ type: "user", content: [{ type: "text", text: "active" }] }],
        [{ type: "assistant", content: [{ type: "text", text: "alt1" }] }],
        [{ type: "assistant", content: [{ type: "text", text: "alt2" }] }],
      ],
    }]);
    expect(branches.length).toBe(2);
    expect(branches[0].pathIndex).toBe(1);
    expect(branches[1].pathIndex).toBe(2);
  });

  it("returns empty when totalHeight is zero", () => {
    expect(computeBranchLayout([0, 0], [{
      messageIndex: 0,
      forkMessageUuid: "a1",
      paths: [
        [{ type: "user", content: [{ type: "text", text: "x" }] }],
        [{ type: "user", content: [{ type: "text", text: "y" }] }],
      ],
    }])).toEqual([]);
  });

  it("enforces minimum bar fraction of 0.005", () => {
    const branches = computeBranchLayout([1000, 1000], [{
      messageIndex: 0,
      forkMessageUuid: "a1",
      paths: [
        [{ type: "user", content: [{ type: "text", text: "active" }] }],
        [{ type: "assistant", content: [{ type: "text", text: "" }] }],
      ],
    }]);
    expect(branches.length).toBe(1);
    expect(branches[0].barFractions[0]).toBeGreaterThanOrEqual(0.005);
  });
});
