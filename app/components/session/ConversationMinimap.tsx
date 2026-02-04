import { useMemo } from "react";
import { computeBarHeights, hitTestMessageIndex } from "~/lib/minimap";

interface ConversationMinimapProps {
  messages: Array<{ type: "user" | "assistant" | "system" }>;
  contentLengths: number[];
  viewportTop: number;
  viewportBottom: number;
  onClickPosition: (messageIndex: number) => void;
}

const MINIMAP_WIDTH = 48;
const HEADER_HEIGHT = 49;
const MIN_BAR_HEIGHT = 2;

export function ConversationMinimap({
  messages,
  contentLengths,
  viewportTop,
  viewportBottom,
  onClickPosition,
}: ConversationMinimapProps) {
  if (messages.length < 5) return null;

  const barHeights = useMemo(() => {
    // Use a fixed reference height; actual will be set by CSS
    return computeBarHeights(contentLengths, 1000, MIN_BAR_HEIGHT);
  }, [contentLengths]);

  const totalBarHeight = barHeights.reduce((a, b) => a + b, 0);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
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
      className="fixed right-0 bg-white border-l border-edge cursor-pointer"
      style={{
        top: HEADER_HEIGHT,
        width: MINIMAP_WIDTH,
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
      }}
      onClick={handleClick}
    >
      {/* Bars container */}
      <div className="relative w-full h-full flex flex-col">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.type === "user" ? "bg-panel" : msg.type === "assistant" ? "bg-teal-light" : "bg-edge-light"}
            style={{ flex: `${barHeights[i]} 0 0` }}
          />
        ))}

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
