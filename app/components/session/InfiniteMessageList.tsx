import { useState, useEffect, useRef, useCallback } from "react";
import type { ParsedMessage } from "~/lib/types";
import { MessageBlock } from "./MessageBlock";

const BATCH_SIZE = 50;

interface InfiniteMessageListProps {
  messages: ParsedMessage[];
  subagentMap: Record<string, string>;
  projectId: string;
  sessionId: string;
  onViewportChange: (topFraction: number, bottomFraction: number) => void;
  scrollToIndex: number | null;
  onScrollComplete: () => void;
}

export function InfiniteMessageList({
  messages,
  subagentMap,
  projectId,
  sessionId,
  onViewportChange,
  scrollToIndex,
  onScrollComplete,
}: InfiniteMessageListProps) {
  const [renderedCount, setRenderedCount] = useState(Math.min(BATCH_SIZE, messages.length));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && renderedCount < messages.length) {
          setRenderedCount((prev) => Math.min(prev + BATCH_SIZE, messages.length));
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [renderedCount, messages.length]);

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
            const visibleBottom = Math.min(rect.height, containerTop + window.innerHeight);
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
      setRenderedCount(Math.min(scrollToIndex + BATCH_SIZE, messages.length));
      return; // Will re-run after render with more messages
    }

    const el = document.getElementById(`msg-${scrollToIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      onScrollComplete();
    }
  }, [scrollToIndex, renderedCount, messages.length, onScrollComplete]);

  return (
    <div ref={containerRef} className="space-y-4">
      {messages.slice(0, renderedCount).map((message, i) => (
        <div key={message.uuid} id={`msg-${i}`}>
          <MessageBlock
            message={message}
            subagentMap={subagentMap}
            projectId={projectId}
            sessionId={sessionId}
          />
        </div>
      ))}
      {renderedCount < messages.length && (
        <div ref={sentinelRef} className="h-px" />
      )}
    </div>
  );
}
