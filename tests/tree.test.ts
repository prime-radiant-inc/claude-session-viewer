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
    const a1 = roots[0].children[0];
    expect(a1.entry.uuid).toBe("a1");
    expect(a1.children.length).toBe(2);
    const childUuids = a1.children.map((c) => c.entry.uuid).sort();
    expect(childUuids).toEqual(["u2", "u3"]);
  });

  it("filters out progress-type entries", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
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

describe("resolveActivePath", () => {
  it("returns linear path for session with no branches", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    expect(activePath.length).toBe(2);
    expect(activePath[0].uuid).toBe("u1");
    expect(activePath[1].uuid).toBe("a1");
  });

  it("picks the latest branch at fork points", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
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
    expect(branches[0].messageIndex).toBe(1);
  });

  it("returns paths ordered newest-first", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    const branches = getBranchPoints(roots, activePath);
    expect(branches[0].paths.length).toBe(2);
    expect(branches[0].paths[0][0].uuid).toBe("u3");
    expect(branches[0].paths[1][0].uuid).toBe("u2");
  });

  it("includes full depth of each alternate path", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "sidechain-session.jsonl"));
    const roots = buildMessageTree(entries);
    const activePath = resolveActivePath(roots);
    const branches = getBranchPoints(roots, activePath);
    expect(branches[0].paths[0].length).toBe(4);
    expect(branches[0].paths[1].length).toBe(3);
  });
});
