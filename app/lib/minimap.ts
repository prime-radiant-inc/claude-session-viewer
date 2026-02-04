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
