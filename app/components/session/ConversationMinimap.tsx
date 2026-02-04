import { useMemo } from "react";
import { computeBarHeights, hitTestMessageIndex, computeBranchLayout } from "~/lib/minimap";
import type { BranchPoint } from "~/lib/tree";
import type { ParsedMessage } from "~/lib/types";

interface ConversationMinimapProps {
  messages: ParsedMessage[];
  contentLengths: number[];
  branchPoints: BranchPoint[];
  viewportTop: number;
  viewportBottom: number;
  onClickPosition: (messageIndex: number) => void;
  onClickBranch: (forkUuid: string, pathIndex: number) => void;
}

const MINIMAP_WIDTH = 64;
const SPINE_WIDTH = 24;
const HEADER_HEIGHT = 49;
const MIN_BAR_HEIGHT = 2;

function barColor(type: "user" | "assistant" | "system"): string {
  if (type === "user") return "bg-panel";
  if (type === "assistant") return "bg-teal-light";
  return "bg-edge-light";
}

export function ConversationMinimap({
  messages,
  contentLengths,
  branchPoints,
  viewportTop,
  viewportBottom,
  onClickPosition,
  onClickBranch,
}: ConversationMinimapProps) {
  if (messages.length < 5) return null;

  const barHeights = useMemo(() => {
    return computeBarHeights(contentLengths, 1000, MIN_BAR_HEIGHT);
  }, [contentLengths]);

  const totalBarHeight = barHeights.reduce((a, b) => a + b, 0);

  const branches = useMemo(() => {
    return computeBranchLayout(barHeights, branchPoints);
  }, [barHeights, branchPoints]);

  function handleSpineClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const scaledY = (clickY / rect.height) * totalBarHeight;
    const index = hitTestMessageIndex(scaledY, barHeights);
    onClickPosition(index);
  }

  const viewportIndicatorTop = viewportTop * 100;
  const viewportIndicatorHeight = Math.max(1, (viewportBottom - viewportTop) * 100);

  return (
    <div
      className="fixed right-0 bg-white border-l border-edge"
      style={{
        top: HEADER_HEIGHT,
        width: MINIMAP_WIDTH,
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
      }}
    >
      {/* Full-height relative container for spine + branches + viewport */}
      <div className="relative w-full h-full">
        {/* Main spine */}
        <div
          className="absolute top-0 left-0 h-full flex flex-col cursor-pointer"
          style={{ width: SPINE_WIDTH }}
          onClick={handleSpineClick}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={barColor(msg.type)}
              style={{ flex: `${barHeights[i]} 0 0` }}
            />
          ))}
        </div>

        {/* Branch offshoots */}
        {branches.map((branch) => {
          const branchHeight = branch.barFractions.reduce((a, b) => a + b, 0);
          return (
            <div
              key={`${branch.forkUuid}-${branch.pathIndex}`}
              className="absolute cursor-pointer"
              style={{
                left: SPINE_WIDTH,
                top: `${branch.forkFraction * 100}%`,
                height: `${branchHeight * 100}%`,
                width: MINIMAP_WIDTH - SPINE_WIDTH,
              }}
              onClick={() => onClickBranch(branch.forkUuid, branch.pathIndex)}
            >
              {/* Connecting line from spine */}
              <div
                className="absolute bg-edge"
                style={{ top: 0, left: 0, width: 4, height: 1 }}
              />
              {/* Branch bars */}
              <div className="flex flex-col h-full" style={{ marginLeft: 4 }}>
                {branch.barFractions.map((frac, i) => (
                  <div
                    key={i}
                    className={barColor(branch.barTypes[i])}
                    style={{ flex: `${frac} 0 0`, opacity: 0.4 }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Viewport indicator */}
        <div
          className="absolute left-0 right-0 border-y border-teal pointer-events-none"
          style={{
            top: `${viewportIndicatorTop}%`,
            height: `${viewportIndicatorHeight}%`,
            backgroundColor: "color-mix(in srgb, var(--color-teal) 15%, transparent)",
          }}
        />
      </div>
    </div>
  );
}
