import { useState, useEffect, useRef, useMemo } from "react";
import type { ParsedMessage } from "~/lib/types";
import type { BranchPoint } from "~/lib/tree";
import { MessageBlock } from "./MessageBlock";
import { BranchSwitcher } from "./BranchSwitcher";

const BATCH_SIZE = 50;

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
}: InfiniteMessageListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set of active-path message uuids for O(1) alternate detection
  const activeMessageUuids = useMemo(
    () => new Set(messages.map((m) => m.uuid)),
    [messages],
  );

  // Build effective message list based on path selections.
  // When all selections are 0 (default), this equals `messages` exactly.
  // When a user picks an alternate at a branch point, everything after the
  // fork is replaced with that branch's messages (dead-end).
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

  // Determine which branch points are visible in the current effective list.
  // Once we hit the switched branch point, no later ones are visible.
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
    <div ref={containerRef} className="space-y-4">
      {effectiveMessages.slice(0, renderedCount).map((message, i) => {
        const isAlternate = !activeMessageUuids.has(message.uuid);
        const switcher = switcherByIndex.get(i);

        return (
          <div key={message.uuid} id={`msg-${i}`}>
            <div
              className={
                isAlternate
                  ? "border-l-2 border-dashed border-amber-400 pl-3"
                  : ""
              }
            >
              <MessageBlock
                message={message}
                subagentMap={subagentMap}
                projectId={projectId}
                sessionId={sessionId}
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
