import { useState, useEffect, useRef, useMemo } from "react";
import type { ParsedMessage, ContentBlock } from "~/lib/types";
import type { BranchPoint } from "~/lib/tree";
import { MessageBlock } from "./MessageBlock";
import { BranchSwitcher } from "./BranchSwitcher";

const BATCH_SIZE = 50;

export interface ToolResultEntry {
  content: string | ContentBlock[];
  isError: boolean;
}

interface InfiniteMessageListProps {
  messages: ParsedMessage[];
  branchPoints: BranchPoint[];
  pathSelections: Record<string, number>;
  onPathSwitch: (forkUuid: string, pathIndex: number) => void;
  subagentMap: Record<string, string>;
  projectId: string;
  sessionId: string;
  onViewportChange: (topFraction: number, bottomFraction: number) => void;
  scrollToIndex: number | null;
  onScrollComplete: () => void;
  showToolCalls: boolean;
  showThinking: boolean;
  userName?: string;
}

export function InfiniteMessageList({
  messages,
  branchPoints,
  pathSelections,
  onPathSwitch,
  subagentMap,
  projectId,
  sessionId,
  onViewportChange,
  scrollToIndex,
  onScrollComplete,
  showToolCalls,
  showThinking,
  userName,
}: InfiniteMessageListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set of active-path message uuids for O(1) alternate detection
  const activeMessageUuids = useMemo(
    () => new Set(messages.map((m) => m.uuid)),
    [messages],
  );

  // Build effective message list based on path selections.
  const effectiveMessages = useMemo(() => {
    for (const bp of branchPoints) {
      const selected = Math.min(pathSelections[bp.forkMessageUuid] ?? 0, bp.paths.length - 1);
      if (selected !== 0) {
        return [
          ...messages.slice(0, bp.messageIndex + 1),
          ...bp.paths[selected],
        ];
      }
    }
    return messages;
  }, [messages, branchPoints, pathSelections]);

  // Build tool result map: tool_use_id -> result content.
  // Also track which message uuids are fully consumed by inline rendering.
  const { toolResultMap, consumedUuids } = useMemo(() => {
    const map = new Map<string, ToolResultEntry>();
    const consumed = new Set<string>();

    for (const msg of effectiveMessages) {
      if (!msg.isToolResult) continue;

      let allConsumed = true;
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          map.set(block.tool_use_id, {
            content: block.content,
            isError: block.is_error ?? false,
          });
        } else {
          // Has non-tool-result content — don't fully consume
          allConsumed = false;
        }
      }
      if (allConsumed) consumed.add(msg.uuid);
    }

    return { toolResultMap: map, consumedUuids: consumed };
  }, [effectiveMessages]);

  // Compute continuation flags. A turn boundary occurs at:
  // - A real user message (not tool_result) → new user turn
  // - The first assistant message after a real user message → new assistant turn
  // Everything else (tool results, subsequent assistant messages) is a continuation.
  const continuationFlags = useMemo(() => {
    const flags: boolean[] = new Array(effectiveMessages.length).fill(false);
    let expectAssistantHeader = false;
    for (let i = 1; i < effectiveMessages.length; i++) {
      const msg = effectiveMessages[i];
      const isRealUserMessage = msg.type === "user" && !msg.isToolResult;
      if (isRealUserMessage) {
        flags[i] = false;
        expectAssistantHeader = true;
      } else if (expectAssistantHeader && msg.type === "assistant") {
        flags[i] = false;
        expectAssistantHeader = false;
      } else {
        flags[i] = true;
      }
    }
    return flags;
  }, [effectiveMessages]);

  // Determine which branch points are visible in the current effective list.
  const visibleBranchPoints = useMemo(() => {
    const visible: Array<{ position: number; branchPoint: BranchPoint }> = [];
    for (const bp of branchPoints) {
      const selected = pathSelections[bp.forkMessageUuid] ?? 0;
      visible.push({ position: bp.messageIndex, branchPoint: bp });
      if (selected !== 0) break;
    }
    return visible;
  }, [branchPoints, pathSelections]);

  // Map from effective message index -> branch point info for fast lookup
  const switcherByIndex = useMemo(() => {
    const map = new Map<number, { branchPoint: BranchPoint }>();
    for (const v of visibleBranchPoints) {
      map.set(v.position, { branchPoint: v.branchPoint });
    }
    return map;
  }, [visibleBranchPoints]);

  const [renderedCount, setRenderedCount] = useState(
    Math.min(BATCH_SIZE, effectiveMessages.length),
  );

  // Reset rendered count when effective messages change length
  useEffect(() => {
    setRenderedCount(Math.min(BATCH_SIZE, effectiveMessages.length));
  }, [effectiveMessages.length]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && renderedCount < effectiveMessages.length) {
          setRenderedCount((prev) =>
            Math.min(prev + BATCH_SIZE, effectiveMessages.length),
          );
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [renderedCount, effectiveMessages.length]);

  // Scroll tracking for minimap viewport
  useEffect(() => {
    let ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const containerTop = -rect.top;
            const visibleTop = Math.max(0, containerTop);
            const visibleBottom = Math.min(
              rect.height,
              containerTop + window.innerHeight,
            );
            if (rect.height > 0) {
              onViewportChange(visibleTop / rect.height, visibleBottom / rect.height);
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // Initial call
    return () => window.removeEventListener("scroll", onScroll);
  }, [onViewportChange, renderedCount]);

  // Scroll to index
  useEffect(() => {
    if (scrollToIndex === null) return;

    if (scrollToIndex >= renderedCount) {
      setRenderedCount(
        Math.min(scrollToIndex + BATCH_SIZE, effectiveMessages.length),
      );
      return; // Will re-run after render with more messages
    }

    const el = document.getElementById(`msg-${scrollToIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      onScrollComplete();
    }
  }, [scrollToIndex, renderedCount, effectiveMessages.length, onScrollComplete]);

  return (
    <div ref={containerRef} className="space-y-6">
      {effectiveMessages.slice(0, renderedCount).map((message, i) => {
        const isAlternate = !activeMessageUuids.has(message.uuid);
        const switcher = switcherByIndex.get(i);
        const isConsumed = consumedUuids.has(message.uuid);

        return (
          <div key={message.uuid} id={`msg-${i}`}>
            <div
              className={
                isAlternate
                  ? "bg-amber-100/40 rounded-lg px-3 py-1"
                  : ""
              }
            >
              <MessageBlock
                message={message}
                isContinuation={continuationFlags[i]}
                isConsumedToolResult={isConsumed}
                toolResultMap={toolResultMap}
                subagentMap={subagentMap}
                projectId={projectId}
                sessionId={sessionId}
                showToolCalls={showToolCalls}
                showThinking={showThinking}
                userName={userName}
              />
            </div>
            {switcher && (
              <BranchSwitcher
                pathCount={switcher.branchPoint.paths.length}
                activePathIndex={
                  pathSelections[switcher.branchPoint.forkMessageUuid] ?? 0
                }
                onSwitch={(pathIndex) =>
                  onPathSwitch(switcher.branchPoint.forkMessageUuid, pathIndex)
                }
              />
            )}
          </div>
        );
      })}
      {renderedCount < effectiveMessages.length && (
        <div ref={sentinelRef} className="h-px" />
      )}
    </div>
  );
}
