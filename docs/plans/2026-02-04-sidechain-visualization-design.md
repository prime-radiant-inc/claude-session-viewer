# Sidechain Visualization Design

**Goal:** Replace flat message list with tree-aware rendering that shows conversation branches (sidechains) as swappable alternate paths, with minimap integration.

## Context

Claude Code session JSONL files form a tree via `uuid`/`parentUuid` links. When a user retries or edits a message, the conversation forks. The abandoned path becomes a sidechain (dead-end branch). The current viewer ignores this structure entirely, sorting all messages by timestamp into a flat list.

Key data facts:
- Sidechains never merge back. They are strict dead-ends.
- A 4,269-message session had 122 branch points and 909 orphaned messages.
- Many branch points are `progress`-type messages from tool hooks (noise to filter).
- Genuine forks are user retries/edits creating alternate assistant responses.

## Branch Point Switcher

At each fork in the conversation, a switcher control appears between the branch-point message and its active child:

```
◆ Path 3 of 3  ◀ ▶
(2 earlier attempts)
```

- Default view shows the latest/last-taken branch (by deepest descendant timestamp).
- Clicking ◀/▶ swaps the entire downstream conversation to that branch's thread.
- Non-active paths get a muted visual treatment (different left border color) so you know you're viewing an alternate history.
- Swapping back to the latest path restores the default view.

## Minimap with Branches and Subagents

The minimap evolves from a flat bar list to a tree visualization:

- **Main spine** (left-aligned, ~24px): User (panel color) and assistant (teal) bars, proportionally sized. Same as current behavior.
- **Branch points**: A horizontal line extends right from the bar, connecting to smaller muted bars (40% opacity) representing abandoned paths.
- **Subagent traces**: Fork off with a distinct warm color, connected by a line to the parent Task tool_use bar.
- **Clicking**: Main bars jump to that message. Sidechain bars jump to the branch point AND swap the switcher to that path.
- **Viewport indicator**: Same overlay tracking, wider to encompass branch offshoots.
- **Width**: Grows from 48px to ~64px. Main spine ~24px left, branches extend into remaining ~40px.

## Data Layer

New pure functions in `app/lib/tree.ts`, layered on top of existing `parseSessionFile`:

- `buildMessageTree(entries)` -- Constructs tree from uuid/parentUuid. Returns forest roots. Filters out progress-type noise branches.
- `resolveActivePath(roots)` -- Walks tree picking latest child at each fork. Returns flat ordered list (same shape as current `buildConversationThread` output).
- `getBranchPoints(roots)` -- Finds nodes with >1 non-progress child. Returns `{ messageIndex, paths }` for each fork.

The route loader uses tree functions instead of `buildConversationThread`. Branch data ships to the client so path swapping is instant (no server round-trip).

## Testing

New fixture: `tests/fixtures/sidechain-session.jsonl` with branch points and multi-depth sidechains.

Unit tests for tree.ts:
- buildMessageTree: correct parenting, multiple roots, progress filtering
- resolveActivePath: picks latest branch, matches old output for non-branching sessions
- getBranchPoints: identifies forks, returns correct alternate paths, excludes noise forks
- Edge cases: orphaned messages, single-message sessions

Existing parser tests stay green. No component tests -- visual behavior verified manually with real data.
