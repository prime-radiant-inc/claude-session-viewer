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

/**
 * Build a tree of MessageNodes from raw log entries.
 * Filters to user/assistant types, skips isMeta and entries without uuid/message.
 */
export function buildMessageTree(entries: RawLogEntry[]): MessageNode[] {
  const nodesByUuid = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];

  // First pass: create nodes for all valid entries
  for (const entry of entries) {
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (!entry.uuid || !entry.message) continue;
    if (entry.isMeta) continue;

    const node: MessageNode = {
      entry: entryToParsedMessage(entry),
      children: [],
    };
    nodesByUuid.set(entry.uuid, node);
  }

  // Second pass: wire up parent-child relationships
  for (const [, node] of nodesByUuid) {
    const parentUuid = node.entry.parentUuid;
    if (parentUuid && nodesByUuid.has(parentUuid)) {
      nodesByUuid.get(parentUuid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Walk the tree picking the child with the latest deepest descendant timestamp
 * at each fork. Returns a flat array representing the "active" conversation path.
 */
export function resolveActivePath(roots: MessageNode[]): ParsedMessage[] {
  if (roots.length === 0) return [];

  // Pick root with latest deepest timestamp
  let current = roots.reduce((best, r) =>
    deepestTimestamp(r) > deepestTimestamp(best) ? r : best,
  );

  const path: ParsedMessage[] = [current.entry];

  while (current.children.length > 0) {
    current = current.children.reduce((best, child) =>
      deepestTimestamp(child) > deepestTimestamp(best) ? child : best,
    );
    path.push(current.entry);
  }

  return path;
}

/**
 * Find nodes on the active path that have more than one child.
 * Returns branch info with all paths ordered newest-first.
 */
export function getBranchPoints(
  roots: MessageNode[],
  activePath: ParsedMessage[],
): BranchPoint[] {
  const nodesByUuid = new Map<string, MessageNode>();
  collectNodes(roots, nodesByUuid);

  const branchPoints: BranchPoint[] = [];

  for (let i = 0; i < activePath.length; i++) {
    const msg = activePath[i];
    const node = nodesByUuid.get(msg.uuid);
    if (!node || node.children.length <= 1) continue;

    // Sort children newest-first by deepest timestamp
    const sortedChildren = [...node.children].sort((a, b) =>
      deepestTimestamp(b).localeCompare(deepestTimestamp(a)),
    );

    const paths = sortedChildren.map((child) => flattenBranch(child));

    branchPoints.push({
      messageIndex: i,
      forkMessageUuid: msg.uuid,
      paths,
    });
  }

  return branchPoints;
}

// --- Helpers ---

/** Convert a RawLogEntry to ParsedMessage. Matches buildConversationThread logic. */
function entryToParsedMessage(entry: RawLogEntry): ParsedMessage {
  const content = normalizeContent(entry.message?.content);

  const toolResultBlock = content.find((b) => b.type === "tool_result");
  const isToolResult = !!toolResultBlock;
  const toolResultId =
    toolResultBlock?.type === "tool_result" ? toolResultBlock.tool_use_id : undefined;
  const isError =
    toolResultBlock?.type === "tool_result" ? (toolResultBlock.is_error ?? false) : undefined;

  let subagentId: string | undefined;
  let subagentDescription: string | undefined;
  for (const block of content) {
    if (block.type === "tool_use" && block.name === "Task") {
      subagentId = block.id;
      subagentDescription = (block.input as Record<string, unknown>).description as
        | string
        | undefined;
    }
  }

  return {
    uuid: entry.uuid!,
    parentUuid: entry.parentUuid ?? null,
    type: entry.type as "user" | "assistant" | "system",
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

function normalizeContent(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

/** Recursively find the latest timestamp in a subtree. */
function deepestTimestamp(node: MessageNode): string {
  let latest = node.entry.timestamp;
  for (const child of node.children) {
    const childTs = deepestTimestamp(child);
    if (childTs > latest) latest = childTs;
  }
  return latest;
}

/** Flatten a subtree into a linear path by always following the child with the latest deepest descendant. */
function flattenBranch(node: MessageNode): ParsedMessage[] {
  const result: ParsedMessage[] = [node.entry];
  let current = node;
  while (current.children.length > 0) {
    current = current.children.reduce((best, child) =>
      deepestTimestamp(child) > deepestTimestamp(best) ? child : best,
    );
    result.push(current.entry);
  }
  return result;
}

/** Recursively collect all nodes into a map by uuid. */
function collectNodes(roots: MessageNode[], map: Map<string, MessageNode>): void {
  for (const node of roots) {
    map.set(node.entry.uuid, node);
    collectNodes(node.children, map);
  }
}
