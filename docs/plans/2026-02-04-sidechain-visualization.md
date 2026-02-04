# Sidechain Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat timestamp-sorted message list with tree-aware rendering that shows sidechains as swappable alternate paths, with branch indicators in the minimap.

**Architecture:** Build a tree from uuid/parentUuid, walk the "latest" branch to produce the default path, identify branch points with alternates, ship all data to the client. Client renders branch-point switchers and an enhanced minimap with branch offshoots. Path swapping is purely client-side.

**Tech Stack:** TypeScript, React, Vitest. No new dependencies.

---

### Task 1: Test Fixture for Sidechains

**Files:**
- Create: `tests/fixtures/sidechain-session.jsonl`

A hand-crafted session with:
- Root user message `u1` (parentUuid: null)
- Assistant response `a1` (parent: u1)
- **Branch point at a1**: two user follow-ups
  - `u2` (parent: a1, isSidechain: false) -- this is the "old" attempt
  - `u3` (parent: a1, isSidechain: false) -- this is the "latest" attempt (later timestamp)
- Under u2 (the abandoned branch): assistant `a2` (parent: u2), then user `u2b` (parent: a2) -- 2-deep sidechain
- Under u3 (the active branch): assistant `a3` (parent: u3), user `u4` (parent: a3), assistant `a4` (parent: u4)
- A progress-type message `p1` (parent: a1) that should be filtered as noise

**Step 1: Create the fixture**

```jsonl
{"type":"user","uuid":"u1","parentUuid":null,"sessionId":"s1","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"Fix the auth bug"}}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"s1","timestamp":"2026-01-21T10:00:01Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"Let me look at the auth module."}],"model":"claude-sonnet-4-20250514","usage":{"input_tokens":10,"output_tokens":20}}}
{"type":"progress","uuid":"p1","parentUuid":"a1","sessionId":"s1","timestamp":"2026-01-21T10:00:02Z","isSidechain":false,"data":{"type":"hook","hookEvent":"PostToolUse","hookName":"PostToolUse:Read"}}
{"type":"user","uuid":"u2","parentUuid":"a1","sessionId":"s1","timestamp":"2026-01-21T10:00:03Z","isSidechain":false,"message":{"role":"user","content":"Try a different approach"}}
{"type":"assistant","uuid":"a2","parentUuid":"u2","sessionId":"s1","timestamp":"2026-01-21T10:00:04Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"OK, let me try refactoring the middleware."}],"model":"claude-sonnet-4-20250514","usage":{"input_tokens":15,"output_tokens":25}}}
{"type":"user","uuid":"u2b","parentUuid":"a2","sessionId":"s1","timestamp":"2026-01-21T10:00:05Z","isSidechain":false,"message":{"role":"user","content":"Actually never mind"}}
{"type":"user","uuid":"u3","parentUuid":"a1","sessionId":"s1","timestamp":"2026-01-21T10:00:10Z","isSidechain":false,"message":{"role":"user","content":"Check the JWT validation instead"}}
{"type":"assistant","uuid":"a3","parentUuid":"u3","sessionId":"s1","timestamp":"2026-01-21T10:00:11Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"Found the issue in JWT validation."}],"model":"claude-sonnet-4-20250514","usage":{"input_tokens":20,"output_tokens":30}}}
{"type":"user","uuid":"u4","parentUuid":"a3","sessionId":"s1","timestamp":"2026-01-21T10:00:12Z","isSidechain":false,"message":{"role":"user","content":"Great, fix it"}}
{"type":"assistant","uuid":"a4","parentUuid":"u4","sessionId":"s1","timestamp":"2026-01-21T10:00:13Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"Fixed. The token expiry check was off by one."}],"model":"claude-sonnet-4-20250514","usage":{"input_tokens":25,"output_tokens":15}}}
{"type":"summary","summary":"Auth bug fix via JWT validation","leafUuid":"a4"}
```

**Step 2: Verify fixture parses**

Run: `npx vitest run tests/parser.test.ts`
Expected: All existing parser tests still pass (fixture isn't referenced yet).

**Step 3: Commit**

```bash
git add tests/fixtures/sidechain-session.jsonl
git commit -m "test: add sidechain session fixture with branch point"
```

---

### Task 2: Tree Data Structure and Pure Functions

**Files:**
- Create: `tests/tree.test.ts`
- Create: `app/lib/tree.ts`

**Context:** The tree module builds a tree from RawLogEntry uuid/parentUuid links, then resolves the "active path" (the path following the latest branch at each fork). It also identifies branch points with their alternate paths.

Types needed (define in `app/lib/tree.ts`):

```typescript
import type { RawLogEntry, ParsedMessage, ContentBlock } from "./types";

export interface MessageNode {
  entry: ParsedMessage;
  children: MessageNode[];
}

export interface BranchPoint {
  // Index into the active path where the fork occurs
  messageIndex: number;
  // The uuid of the message that has multiple children
  forkMessageUuid: string;
  // All paths from this fork, each an array of ParsedMessages from fork child to dead-end
  // paths[0] is always the currently active path's branch
  // paths are ordered newest-first (by deepest descendant timestamp)
  paths: ParsedMessage[][];
}
```

**Step 1: Write failing tests for `buildMessageTree`**

File: `tests/tree.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { buildMessageTree, resolveActivePath, getBranchPoints } from "~/lib/tree";
import { parseSessionFile, buildConversationThread } from "~/lib/parser.server";
import path from "path";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("buildMessageTree", () => {
  it("builds a single-root tree from simple session", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const roots = buildMessageTree(entries);
    expect(roots.length).toBe(1);
    expect(roots[0].entry.uuid).toBe("u1");
    expect(roots[0].children.length).toBe(1);
    expect(roots[0].children[0].entry.uuid).toBe("a1");
  });

  it("builds tree with branch point from sidechain session", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    expect(roots.length).toBe(1);
    expect(roots[0].entry.uuid).toBe("u1");
    // a1 is child of u1
    const a1 = roots[0].children[0];
    expect(a1.entry.uuid).toBe("a1");
    // a1 has 2 children (u2 and u3) -- progress p1 is filtered out
    expect(a1.children.length).toBe(2);
    const childUuids = a1.children.map((c) => c.entry.uuid).sort();
    expect(childUuids).toEqual(["u2", "u3"]);
  });

  it("filters out progress-type entries", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    // p1 should not appear anywhere in the tree
    function collectUuids(node: { entry: { uuid: string }; children: any[] }): string[] {
      return [node.entry.uuid, ...node.children.flatMap(collectUuids)];
    }
    const allUuids = roots.flatMap(collectUuids);
    expect(allUuids).not.toContain("p1");
  });

  it("handles entries with no parentUuid as roots", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const roots = buildMessageTree(entries);
    expect(roots[0].entry.parentUuid).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tree.test.ts`
Expected: FAIL -- module `~/lib/tree` does not exist.

**Step 3: Write failing tests for `resolveActivePath`**

Append to `tests/tree.test.ts`:

```typescript
describe("resolveActivePath", () => {
  it("returns linear path for session with no branches", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    expect(activePath.length).toBe(2); // u1, a1
    expect(activePath[0].uuid).toBe("u1");
    expect(activePath[1].uuid).toBe("a1");
  });

  it("picks the latest branch at fork points", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    // Should follow u1 -> a1 -> u3 -> a3 -> u4 -> a4 (latest branch)
    const uuids = activePath.map((m) => m.uuid);
    expect(uuids).toEqual(["u1", "a1", "u3", "a3", "u4", "a4"]);
  });

  it("matches buildConversationThread output for non-branching sessions", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const oldThread = buildConversationThread(entries);
    const roots = buildMessageTree(entries);
    const newThread = resolveActivePath(roots);
    expect(newThread.length).toBe(oldThread.length);
    expect(newThread.map((m) => m.uuid)).toEqual(oldThread.map((m) => m.uuid));
  });
});
```

**Step 4: Write failing tests for `getBranchPoints`**

Append to `tests/tree.test.ts`:

```typescript
describe("getBranchPoints", () => {
  it("returns empty array for session with no branches", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    const branches = getBranchPoints(roots, activePath);
    expect(branches).toEqual([]);
  });

  it("identifies the branch point in sidechain session", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    const branches = getBranchPoints(roots, activePath);
    expect(branches.length).toBe(1);
    expect(branches[0].forkMessageUuid).toBe("a1");
  });

  it("returns correct messageIndex into active path", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    const branches = getBranchPoints(roots, activePath);
    // a1 is at index 1 in the active path [u1, a1, u3, a3, u4, a4]
    expect(branches[0].messageIndex).toBe(1);
  });

  it("returns paths ordered newest-first", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    const branches = getBranchPoints(roots, activePath);
    // paths[0] = the active branch (u3->a3->u4->a4), paths[1] = abandoned (u2->a2->u2b)
    expect(branches[0].paths.length).toBe(2);
    expect(branches[0].paths[0][0].uuid).toBe("u3");
    expect(branches[0].paths[1][0].uuid).toBe("u2");
  });

  it("includes full depth of each alternate path", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    const branches = getBranchPoints(roots, activePath);
    // Active branch: u3, a3, u4, a4
    expect(branches[0].paths[0].length).toBe(4);
    // Abandoned branch: u2, a2, u2b
    expect(branches[0].paths[1].length).toBe(3);
  });
});
```

**Step 5: Run all tree tests to confirm they fail**

Run: `npx vitest run tests/tree.test.ts`
Expected: FAIL -- module not found.

**Step 6: Implement `app/lib/tree.ts`**

```typescript
import type { RawLogEntry, ParsedMessage, ContentBlock } from "./types";

export interface MessageNode {
  entry: ParsedMessage;
  children: MessageNode[];
}

export interface BranchPoint {
  messageIndex: number;
  forkMessageUuid: string;
  paths: ParsedMessage[][];
}

function normalizeContent(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

function entryToParsedMessage(entry: RawLogEntry): ParsedMessage {
  const content = normalizeContent(entry.message?.content);
  const toolResultBlock = content.find((b) => b.type === "tool_result");
  const isToolResult = !!toolResultBlock;
  const toolResultId = toolResultBlock?.type === "tool_result" ? toolResultBlock.tool_use_id : undefined;
  const isError = toolResultBlock?.type === "tool_result" ? toolResultBlock.is_error ?? false : undefined;

  let subagentId: string | undefined;
  let subagentDescription: string | undefined;
  for (const block of content) {
    if (block.type === "tool_use" && block.name === "Task") {
      subagentId = block.id;
      subagentDescription = (block.input as Record<string, unknown>).description as string | undefined;
    }
  }

  return {
    uuid: entry.uuid!,
    parentUuid: entry.parentUuid ?? null,
    type: entry.type as "user" | "assistant",
    timestamp: entry.timestamp ?? "",
    content,
    model: entry.message?.model,
    usage: entry.message?.usage,
    isSidechain: entry.isSidechain ?? false,
    isToolResult,
    toolResultId,
    isError,
    subagentId,
    subagentDescription,
  };
}

/**
 * Build a tree from raw JSONL entries.
 * Filters to user/assistant only (no progress, system, summary, etc.).
 * Skips entries without uuid or message, and isMeta entries.
 */
export function buildMessageTree(entries: RawLogEntry[]): MessageNode[] {
  const nodeMap = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];

  // First pass: create nodes for user/assistant entries only
  for (const entry of entries) {
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (!entry.uuid || !entry.message) continue;
    if (entry.isMeta) continue;

    const node: MessageNode = {
      entry: entryToParsedMessage(entry),
      children: [],
    };
    nodeMap.set(entry.uuid, node);
  }

  // Second pass: link children to parents
  for (const node of nodeMap.values()) {
    const parentUuid = node.entry.parentUuid;
    if (parentUuid && nodeMap.has(parentUuid)) {
      nodeMap.get(parentUuid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Find the deepest descendant timestamp in a subtree.
 * Used to determine which branch is "latest" (most recently active).
 */
function deepestTimestamp(node: MessageNode): string {
  if (node.children.length === 0) return node.entry.timestamp;
  let latest = node.entry.timestamp;
  for (const child of node.children) {
    const t = deepestTimestamp(child);
    if (t > latest) latest = t;
  }
  return latest;
}

/**
 * Walk the tree from roots, picking the child with the latest deepest
 * descendant at each fork. Returns the "active path" as a flat array.
 */
export function resolveActivePath(roots: MessageNode[]): ParsedMessage[] {
  if (roots.length === 0) return [];

  // Pick the root with the latest deepest descendant
  let current: MessageNode = roots[0];
  for (const root of roots.slice(1)) {
    if (deepestTimestamp(root) > deepestTimestamp(current)) {
      current = root;
    }
  }

  const path: ParsedMessage[] = [];
  while (current) {
    path.push(current.entry);
    if (current.children.length === 0) break;
    if (current.children.length === 1) {
      current = current.children[0];
    } else {
      // Pick child with latest deepest descendant
      let best = current.children[0];
      for (const child of current.children.slice(1)) {
        if (deepestTimestamp(child) > deepestTimestamp(best)) {
          best = child;
        }
      }
      current = best;
    }
  }

  return path;
}

/**
 * Flatten a subtree into a linear path by always following
 * the child with the latest deepest descendant.
 */
function flattenBranch(node: MessageNode): ParsedMessage[] {
  const result: ParsedMessage[] = [];
  let current: MessageNode | null = node;
  while (current) {
    result.push(current.entry);
    if (current.children.length === 0) break;
    if (current.children.length === 1) {
      current = current.children[0];
    } else {
      let best = current.children[0];
      for (const child of current.children.slice(1)) {
        if (deepestTimestamp(child) > deepestTimestamp(best)) {
          best = child;
        }
      }
      current = best;
    }
  }
  return result;
}

/**
 * Find all branch points in the tree. A branch point is a node with >1 child.
 * Returns BranchPoint objects with:
 * - messageIndex: index of the fork node in the active path
 * - forkMessageUuid: uuid of the fork node
 * - paths: all branches ordered newest-first (by deepest descendant timestamp)
 */
export function getBranchPoints(
  roots: MessageNode[],
  activePath: ParsedMessage[]
): BranchPoint[] {
  const activeUuids = new Set(activePath.map((m) => m.uuid));
  const result: BranchPoint[] = [];

  // Build a node lookup from the tree
  const nodeMap = new Map<string, MessageNode>();
  function index(node: MessageNode) {
    nodeMap.set(node.entry.uuid, node);
    for (const child of node.children) index(child);
  }
  for (const root of roots) index(root);

  // Walk the active path looking for nodes with multiple children
  for (let i = 0; i < activePath.length; i++) {
    const node = nodeMap.get(activePath[i].uuid);
    if (!node || node.children.length <= 1) continue;

    // Sort children by deepest descendant timestamp, newest first
    const sorted = [...node.children].sort(
      (a, b) => deepestTimestamp(b).localeCompare(deepestTimestamp(a))
    );

    const paths = sorted.map((child) => flattenBranch(child));

    result.push({
      messageIndex: i,
      forkMessageUuid: node.entry.uuid,
      paths,
    });
  }

  return result;
}
```

**Step 7: Run tests**

Run: `npx vitest run tests/tree.test.ts`
Expected: All 11 tests PASS.

**Step 8: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests + new tree tests pass.

**Step 9: Commit**

```bash
git add app/lib/tree.ts tests/tree.test.ts
git commit -m "feat: tree data structure for sidechain-aware conversation threading"
```

---

### Task 3: Wire Tree into Session Detail Loader

**Files:**
- Modify: `app/routes/sessions.$projectId.$sessionId.tsx`

**Context:** Replace `buildConversationThread` with `buildMessageTree` + `resolveActivePath` + `getBranchPoints` in the loader. The loader returns `messages` (active path), `branchPoints`, and the full tree data needed for path swapping.

**Step 1: Update the loader imports and logic**

In `app/routes/sessions.$projectId.$sessionId.tsx`, change:

Replace the import line:
```typescript
import { parseSessionFile, buildConversationThread, readSubagentFirstPrompt } from "~/lib/parser.server";
```
with:
```typescript
import { parseSessionFile, readSubagentFirstPrompt } from "~/lib/parser.server";
import { buildMessageTree, resolveActivePath, getBranchPoints } from "~/lib/tree";
import type { BranchPoint } from "~/lib/tree";
```

Replace these lines in the loader:
```typescript
  const entries = await parseSessionFile(session.file_path);
  const messages = buildConversationThread(entries);
```
with:
```typescript
  const entries = await parseSessionFile(session.file_path);
  const roots = buildMessageTree(entries);
  const messages = resolveActivePath(roots);
  const branchPoints = getBranchPoints(roots, messages);
```

Add `branchPoints` to the return object:
```typescript
  return {
    sessionId,
    projectId,
    firstPrompt: session.first_prompt,
    summary: session.summary,
    created: session.created,
    modified: session.modified,
    gitBranch: session.git_branch,
    messages,
    branchPoints,
    subagents,
    subagentMap,
    totalInput,
    totalOutput,
    contentLengths: messages.map((m) => estimateContentLength(m.content)),
  };
```

**Step 2: Verify the app still loads**

Run: `npx vitest run`
Expected: All tests pass.

Start the dev server and load a session in the browser. The conversation should look the same as before (since resolveActivePath follows the latest branch, which was the only visible thread before).

**Step 3: Commit**

```bash
git add app/routes/sessions.$projectId.$sessionId.tsx
git commit -m "feat: use tree-based threading in session detail loader"
```

---

### Task 4: Branch Point Switcher Component

**Files:**
- Create: `app/components/session/BranchSwitcher.tsx`
- Modify: `app/components/session/InfiniteMessageList.tsx`

**Context:** The BranchSwitcher renders at fork points. It shows which path you're on and lets you switch. When you switch, everything below the fork re-renders with the alternate branch's messages.

The InfiniteMessageList needs to:
1. Accept `branchPoints` and merge active + alternate messages based on current selections
2. Insert BranchSwitcher controls at fork points
3. Manage selected path state per branch point

**Step 1: Create BranchSwitcher component**

File: `app/components/session/BranchSwitcher.tsx`

```tsx
interface BranchSwitcherProps {
  pathCount: number;
  activePathIndex: number;
  onSwitch: (pathIndex: number) => void;
}

export function BranchSwitcher({ pathCount, activePathIndex, onSwitch }: BranchSwitcherProps) {
  if (pathCount <= 1) return null;

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 my-1 rounded bg-panel border border-edge text-xs">
      <button
        className="text-slate hover:text-ink disabled:opacity-30"
        disabled={activePathIndex === 0}
        onClick={() => onSwitch(activePathIndex - 1)}
        aria-label="Previous path"
      >
        &#9664;
      </button>
      <span className="text-ink font-medium">
        Path {activePathIndex + 1} of {pathCount}
      </span>
      <button
        className="text-slate hover:text-ink disabled:opacity-30"
        disabled={activePathIndex === pathCount - 1}
        onClick={() => onSwitch(activePathIndex + 1)}
        aria-label="Next path"
      >
        &#9654;
      </button>
      {activePathIndex > 0 && (
        <span className="text-slate ml-1">(alternate history)</span>
      )}
    </div>
  );
}
```

**Step 2: Rewrite InfiniteMessageList to support branch switching**

Replace the contents of `app/components/session/InfiniteMessageList.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ParsedMessage } from "~/lib/types";
import type { BranchPoint } from "~/lib/tree";
import { MessageBlock } from "./MessageBlock";
import { BranchSwitcher } from "./BranchSwitcher";

const BATCH_SIZE = 50;

interface InfiniteMessageListProps {
  messages: ParsedMessage[];
  branchPoints: BranchPoint[];
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
  subagentMap,
  projectId,
  sessionId,
  onViewportChange,
  scrollToIndex,
  onScrollComplete,
}: InfiniteMessageListProps) {
  // Track which path is selected at each branch point (by forkMessageUuid)
  const [pathSelections, setPathSelections] = useState<Record<string, number>>({});

  // Build the effective message list by splicing in selected branch paths
  const effectiveMessages = useMemo(() => {
    if (branchPoints.length === 0) return messages;

    // Start with the default active path messages
    const result: ParsedMessage[] = [];
    // Create a set of branch point message indices for quick lookup
    const branchByIndex = new Map<number, BranchPoint>();
    for (const bp of branchPoints) {
      branchByIndex.set(bp.messageIndex, bp);
    }

    // Walk the active path. At each branch point, check if user selected an alternate.
    let i = 0;
    while (i < messages.length) {
      result.push(messages[i]);
      const bp = branchByIndex.get(i);
      if (bp) {
        const selectedPath = pathSelections[bp.forkMessageUuid] ?? 0;
        if (selectedPath !== 0) {
          // Replace everything after the fork with the selected branch
          result.push(...bp.paths[selectedPath]);
          break; // Alternate paths are dead-ends, so we stop here
        }
        // If selectedPath === 0, continue with the default active path
      }
      i++;
    }

    return result;
  }, [messages, branchPoints, pathSelections]);

  // Build a list of where to insert switchers in the effective message list
  const switcherPositions = useMemo(() => {
    const positions: Array<{
      afterIndex: number;
      forkUuid: string;
      pathCount: number;
      activePathIndex: number;
    }> = [];

    // For each branch point, find its position in effectiveMessages
    for (const bp of branchPoints) {
      const idx = effectiveMessages.findIndex((m) => m.uuid === bp.forkMessageUuid);
      if (idx >= 0) {
        positions.push({
          afterIndex: idx,
          forkUuid: bp.forkMessageUuid,
          pathCount: bp.paths.length,
          activePathIndex: pathSelections[bp.forkMessageUuid] ?? 0,
        });
      }
    }

    return positions;
  }, [effectiveMessages, branchPoints, pathSelections]);

  const [renderedCount, setRenderedCount] = useState(Math.min(BATCH_SIZE, effectiveMessages.length));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset rendered count when effective messages change
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
          setRenderedCount((prev) => Math.min(prev + BATCH_SIZE, effectiveMessages.length));
        }
      },
      { rootMargin: "200px" }
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
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onViewportChange, renderedCount]);

  // Scroll to index
  useEffect(() => {
    if (scrollToIndex === null) return;

    if (scrollToIndex >= renderedCount) {
      setRenderedCount(Math.min(scrollToIndex + BATCH_SIZE, effectiveMessages.length));
      return;
    }

    const el = document.getElementById(`msg-${scrollToIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      onScrollComplete();
    }
  }, [scrollToIndex, renderedCount, effectiveMessages.length, onScrollComplete]);

  // Build a quick lookup: afterIndex -> switcher info
  const switcherMap = useMemo(() => {
    const map = new Map<number, (typeof switcherPositions)[0]>();
    for (const sp of switcherPositions) {
      map.set(sp.afterIndex, sp);
    }
    return map;
  }, [switcherPositions]);

  const handleSwitch = useCallback((forkUuid: string, pathIndex: number) => {
    setPathSelections((prev) => ({ ...prev, [forkUuid]: pathIndex }));
  }, []);

  // Determine if we're on an alternate path (for visual treatment)
  const onAlternatePath = Object.values(pathSelections).some((v) => v !== 0);

  return (
    <div ref={containerRef} className="space-y-4">
      {effectiveMessages.slice(0, renderedCount).map((message, i) => {
        // Check if this message is part of an alternate (non-default) branch
        const isAlternate = onAlternatePath && !messages.some((m) => m.uuid === message.uuid);
        const switcher = switcherMap.get(i);

        return (
          <div key={message.uuid}>
            <div
              id={`msg-${i}`}
              className={isAlternate ? "border-l-2 border-dashed border-slate/30 pl-2" : ""}
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
                pathCount={switcher.pathCount}
                activePathIndex={switcher.activePathIndex}
                onSwitch={(idx) => handleSwitch(switcher.forkUuid, idx)}
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
```

**Step 3: Update SessionDetail to pass branchPoints**

In `app/routes/sessions.$projectId.$sessionId.tsx`, update the InfiniteMessageList usage:

```tsx
          <InfiniteMessageList
            messages={data.messages}
            branchPoints={data.branchPoints}
            subagentMap={data.subagentMap}
            projectId={data.projectId}
            sessionId={data.sessionId}
            onViewportChange={handleViewportChange}
            scrollToIndex={scrollToIndex}
            onScrollComplete={handleScrollComplete}
          />
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Manual test**

Load a session that has branch points in the browser. The switcher should appear at fork points. Clicking ◀/▶ should swap the downstream conversation.

**Step 6: Commit**

```bash
git add app/components/session/BranchSwitcher.tsx app/components/session/InfiniteMessageList.tsx app/routes/sessions.$projectId.$sessionId.tsx
git commit -m "feat: branch point switcher for sidechain navigation"
```

---

### Task 5: Enhanced Minimap with Branch Offshoots

**Files:**
- Modify: `app/components/session/ConversationMinimap.tsx`
- Modify: `app/lib/minimap.ts`

**Context:** The minimap needs to show branch offshoots extending to the right from fork points. Each offshoot is a set of smaller, muted bars connected by a line. Clicking an offshoot bar jumps to that branch point and swaps the path.

**Step 1: Add `computeBranchLayout` to minimap.ts**

Append to `app/lib/minimap.ts`:

```typescript
import type { ParsedMessage } from "./types";

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
```

**Step 2: Write tests for computeBranchLayout**

Append to `tests/minimap.test.ts`:

```typescript
import { computeBranchLayout } from "~/lib/minimap";

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
    // Only 2 branches (paths 1 and 2), not path 0
    expect(branches.length).toBe(2);
    expect(branches[0].pathIndex).toBe(1);
    expect(branches[1].pathIndex).toBe(2);
  });
});
```

**Step 3: Run minimap tests**

Run: `npx vitest run tests/minimap.test.ts`
Expected: All tests pass (existing + new).

**Step 4: Rewrite ConversationMinimap.tsx**

Replace contents of `app/components/session/ConversationMinimap.tsx`:

```tsx
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
      {/* Main spine */}
      <div
        className="absolute top-0 left-0 h-full flex flex-col cursor-pointer"
        style={{ width: SPINE_WIDTH }}
        onClick={handleSpineClick}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.type === "user"
                ? "bg-panel"
                : msg.type === "assistant"
                ? "bg-teal-light"
                : "bg-edge-light"
            }
            style={{ flex: `${barHeights[i]} 0 0` }}
          />
        ))}
      </div>

      {/* Branch offshoots */}
      {branches.map((branch, bi) => (
        <div
          key={bi}
          className="absolute cursor-pointer"
          style={{
            left: SPINE_WIDTH,
            top: `${branch.forkFraction * 100}%`,
            width: MINIMAP_WIDTH - SPINE_WIDTH,
          }}
          onClick={() => onClickBranch(branch.forkUuid, branch.pathIndex)}
        >
          {/* Connecting line */}
          <div
            className="absolute top-0 left-0 border-t border-slate/30"
            style={{ width: 6 }}
          />
          {/* Branch bars */}
          <div className="flex flex-col ml-1.5" style={{ opacity: 0.4 }}>
            {branch.barFractions.map((frac, j) => (
              <div
                key={j}
                className={
                  branch.barTypes[j] === "user"
                    ? "bg-panel"
                    : branch.barTypes[j] === "assistant"
                    ? "bg-teal-light"
                    : "bg-edge-light"
                }
                style={{
                  height: `${frac * 100}%`,
                  minHeight: 2,
                  width: MINIMAP_WIDTH - SPINE_WIDTH - 8,
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Viewport indicator */}
      <div
        className="absolute left-0 border-y border-teal pointer-events-none"
        style={{
          top: `${viewportIndicatorTop}%`,
          height: `${viewportIndicatorHeight}%`,
          width: MINIMAP_WIDTH,
          backgroundColor: "color-mix(in srgb, var(--color-teal) 15%, transparent)",
        }}
      />
    </div>
  );
}
```

**Step 5: Update SessionDetail to wire minimap branch clicking**

In `app/routes/sessions.$projectId.$sessionId.tsx`, add a handler and update the minimap:

Add to component state/handlers:
```typescript
  const [branchSelections, setBranchSelections] = useState<Record<string, number>>({});

  const handleBranchClick = useCallback((forkUuid: string, pathIndex: number) => {
    setBranchSelections((prev) => ({ ...prev, [forkUuid]: pathIndex }));
    // Also scroll to the fork point
    const bp = data.branchPoints.find((b) => b.forkMessageUuid === forkUuid);
    if (bp) setScrollToIndex(bp.messageIndex);
  }, [data.branchPoints]);
```

Update the minimap JSX:
```tsx
      <ConversationMinimap
        messages={data.messages}
        contentLengths={data.contentLengths}
        branchPoints={data.branchPoints}
        viewportTop={viewportTop}
        viewportBottom={viewportBottom}
        onClickPosition={(index) => setScrollToIndex(index)}
        onClickBranch={handleBranchClick}
      />
```

**Note:** The `branchSelections` state in SessionDetail needs to be synchronized with the `pathSelections` in InfiniteMessageList. The simplest approach: lift `pathSelections` to SessionDetail and pass it down to both components.

Update SessionDetail to own path selection state:

```typescript
  const [pathSelections, setPathSelections] = useState<Record<string, number>>({});

  const handlePathSwitch = useCallback((forkUuid: string, pathIndex: number) => {
    setPathSelections((prev) => ({ ...prev, [forkUuid]: pathIndex }));
  }, []);

  const handleBranchClick = useCallback((forkUuid: string, pathIndex: number) => {
    setPathSelections((prev) => ({ ...prev, [forkUuid]: pathIndex }));
    const bp = data.branchPoints.find((b) => b.forkMessageUuid === forkUuid);
    if (bp) setScrollToIndex(bp.messageIndex);
  }, [data.branchPoints]);
```

Pass to InfiniteMessageList:
```tsx
          <InfiniteMessageList
            messages={data.messages}
            branchPoints={data.branchPoints}
            pathSelections={pathSelections}
            onPathSwitch={handlePathSwitch}
            subagentMap={data.subagentMap}
            projectId={data.projectId}
            sessionId={data.sessionId}
            onViewportChange={handleViewportChange}
            scrollToIndex={scrollToIndex}
            onScrollComplete={handleScrollComplete}
          />
```

And update InfiniteMessageList to use `pathSelections` and `onPathSwitch` props instead of internal state.

**Step 6: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 7: Manual test with real data**

Load a session with branch points. Verify:
- Minimap shows branch offshoots at fork points
- Clicking a branch offshoot scrolls to the fork and switches the path
- Minimap width is 64px, main spine is 24px on left

**Step 8: Commit**

```bash
git add app/components/session/ConversationMinimap.tsx app/lib/minimap.ts tests/minimap.test.ts app/routes/sessions.$projectId.$sessionId.tsx app/components/session/InfiniteMessageList.tsx
git commit -m "feat: enhanced minimap with branch offshoots and click-to-switch"
```

---

### Task 6: Verify and Polish

**Files:**
- Modify: various (as needed for fixes)

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Test with the large real session**

Load the 4,269-message session (or similar large session with branch points):
`http://jesse-paradise-park:9999/sessions/-Users-jesse-prime-radiant-scribble/15dae600-ded7-464c-863f-df70a3eaf196`

Verify:
- Main conversation loads with infinite scroll
- Branch point switchers appear at fork locations
- Clicking ◀/▶ swaps the downstream thread
- Alternate paths get the dashed-border visual treatment
- Minimap shows branch offshoots to the right of the spine
- Clicking a branch offshoot in the minimap scrolls to the fork and switches to that path
- Viewport indicator still tracks correctly
- No visual glitches or performance issues with many branch points

**Step 3: Commit the remark-gfm fix** (from earlier in the session, uncommitted)

```bash
git add app/components/session/MessageBlock.tsx package.json package-lock.json
git commit -m "fix: add remark-gfm for markdown table rendering"
```

**Step 4: Run tests one final time**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Commit any polish fixes**

```bash
git add -u
git commit -m "chore: polish sidechain visualization"
```
