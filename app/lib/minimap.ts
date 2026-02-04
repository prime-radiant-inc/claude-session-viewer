import type { ContentBlock } from "./types";

export function estimateContentLength(content: ContentBlock[]): number {
  let len = 0;
  for (const block of content) {
    switch (block.type) {
      case "text":
        len += block.text.length;
        break;
      case "thinking":
        len += block.thinking.length;
        break;
      case "tool_use":
        len += JSON.stringify(block.input).length;
        break;
      case "tool_result":
        len += typeof block.content === "string"
          ? block.content.length
          : JSON.stringify(block.content).length;
        break;
    }
  }
  return len;
}

export function computeBarHeights(
  contentLengths: number[],
  totalHeight: number,
  minBarHeight: number
): number[] {
  if (contentLengths.length === 0) return [];

  const totalLength = contentLengths.reduce((a, b) => a + b, 0);
  if (totalLength === 0) return contentLengths.map(() => totalHeight / contentLengths.length);

  // First pass: proportional heights
  const raw = contentLengths.map((len) => (len / totalLength) * totalHeight);

  // Second pass: enforce minimums and redistribute
  const belowMin = raw.filter((h) => h < minBarHeight).length;
  if (belowMin === 0) return raw;

  const minTotal = belowMin * minBarHeight;
  const remainingHeight = totalHeight - minTotal;
  const aboveMinTotal = raw.filter((h) => h >= minBarHeight).reduce((a, b) => a + b, 0);

  return raw.map((h) => {
    if (h < minBarHeight) return minBarHeight;
    return aboveMinTotal > 0 ? (h / aboveMinTotal) * remainingHeight : h;
  });
}

export function hitTestMessageIndex(clickY: number, barHeights: number[]): number {
  if (barHeights.length === 0) return 0;
  let cumulative = 0;
  for (let i = 0; i < barHeights.length; i++) {
    cumulative += barHeights[i];
    if (clickY < cumulative) return i;
  }
  return barHeights.length - 1;
}

export interface MinimapBranch {
  /** Y position (fraction 0-1) where this branch forks from the main spine */
  forkFraction: number;
  /** Height of each bar in the branch (fractions 0-1) */
  barFractions: number[];
  /** Message type for each bar (for coloring) */
  barTypes: Array<"user" | "assistant" | "system">;
  /** Fork UUID to identify which branch point this belongs to */
  forkUuid: string;
  /** Path index this branch represents */
  pathIndex: number;
}

export function computeBranchLayout(
  mainBarHeights: number[],
  branchPoints: Array<{
    messageIndex: number;
    forkMessageUuid: string;
    paths: Array<Array<{ type: "user" | "assistant" | "system"; content: ContentBlock[] }>>;
  }>
): MinimapBranch[] {
  const totalHeight = mainBarHeights.reduce((a, b) => a + b, 0);
  if (totalHeight === 0) return [];

  const branches: MinimapBranch[] = [];

  for (const bp of branchPoints) {
    // Calculate the Y fraction of the fork point in the main spine
    let forkY = 0;
    for (let i = 0; i <= bp.messageIndex; i++) {
      forkY += mainBarHeights[i];
    }
    const forkFraction = forkY / totalHeight;

    // Skip path 0 (that's the active path, shown on the main spine)
    for (let pathIdx = 1; pathIdx < bp.paths.length; pathIdx++) {
      const path = bp.paths[pathIdx];
      const lengths = path.map((m) => estimateContentLength(m.content));
      const pathTotal = lengths.reduce((a, b) => a + b, 0);
      // Scale branch to be proportional but compressed (max 30% of main height)
      const maxBranchHeight = totalHeight * 0.3;
      const scale = pathTotal > 0 ? Math.min(maxBranchHeight, pathTotal) / pathTotal : 0;
      const barFractions = lengths.map((l) => Math.max(0.005, (l * scale) / totalHeight));

      branches.push({
        forkFraction,
        barFractions,
        barTypes: path.map((m) => m.type),
        forkUuid: bp.forkMessageUuid,
        pathIndex: pathIdx,
      });
    }
  }

  return branches;
}
