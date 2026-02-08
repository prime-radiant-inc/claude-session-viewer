import { useState, useCallback, useEffect } from "react";
import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/sessions.$user.$hostname.$projectId.$sessionId";
import { AppShell } from "~/components/layout/AppShell";
import { InfiniteMessageList } from "~/components/session/InfiniteMessageList";
import { ConversationMinimap } from "~/components/session/ConversationMinimap";
import { ensureInitialized } from "~/lib/db.server";
import { estimateContentLength } from "~/lib/minimap";
import { parseSessionFile, readSubagentFirstPrompt } from "~/lib/parser.server";
import { buildMessageTree, resolveActivePath, getBranchPoints } from "~/lib/tree";
import { discoverSubagents } from "~/lib/scanner.server";

export function meta({ data }: Route.MetaArgs) {
  const title = data?.firstPrompt
    ? `${data.firstPrompt.slice(0, 60)} | Sessions`
    : "Session | Sessions";
  return [{ title }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const { user, sessionId } = params;
  const db = await ensureInitialized();

  const session = db.prepare(`
    SELECT session_id, project_dir_id, file_path, first_prompt, summary,
           message_count, subagent_count, created, modified, git_branch, project_path
    FROM sessions WHERE session_id = ?
  `).get(sessionId) as {
    session_id: string;
    project_dir_id: string;
    file_path: string;
    first_prompt: string;
    summary: string;
    message_count: number;
    subagent_count: number;
    created: string;
    modified: string;
    git_branch: string;
    project_path: string;
  } | undefined;

  if (!session) {
    throw new Response("Session not found", { status: 404 });
  }

  const dirId = session.project_dir_id;
  const project = db.prepare("SELECT path FROM projects WHERE dir_id = ?")
    .get(dirId) as { path: string } | undefined;

  const entries = await parseSessionFile(session.file_path);
  const roots = buildMessageTree(entries);
  const messages = resolveActivePath(roots);
  const branchPoints = getBranchPoints(roots, messages);

  const subagentFiles = project
    ? await discoverSubagents(project.path, sessionId!)
    : [];
  const subagents = subagentFiles.map((s) => ({
    agentId: s.agentId,
    filePath: s.filePath,
  }));

  // Build tool_use_id -> agentId mapping by matching Task prompts to subagent first messages
  const subagentMap: Record<string, string> = {};
  if (subagentFiles.length > 0) {
    // Collect Task tool_use prompts from session messages
    const taskPrompts: Array<{ toolUseId: string; prompt: string }> = [];
    for (const msg of messages) {
      for (const block of msg.content) {
        if (block.type === "tool_use" && block.name === "Task") {
          const prompt = (block.input as Record<string, unknown>).prompt;
          if (typeof prompt === "string") {
            taskPrompts.push({ toolUseId: block.id, prompt });
          }
        }
      }
    }

    // Read first prompt from each subagent file and match
    for (const sub of subagentFiles) {
      const firstPrompt = await readSubagentFirstPrompt(sub.filePath);
      if (!firstPrompt) continue;
      const match = taskPrompts.find((tp) => tp.prompt === firstPrompt);
      if (match) {
        subagentMap[match.toolUseId] = sub.agentId;
      }
    }
  }

  let totalInput = 0;
  let totalOutput = 0;
  for (const msg of messages) {
    if (msg.usage) {
      totalInput += msg.usage.input_tokens;
      totalOutput += msg.usage.output_tokens;
    }
  }

  const effectiveUser = user === "_" ? "" : (user ?? "");

  return {
    sessionId,
    projectId: dirId,
    user: effectiveUser,
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
}

export default function SessionDetail() {
  const data = useLoaderData<typeof loader>();
  const [viewportTop, setViewportTop] = useState(0);
  const [viewportBottom, setViewportBottom] = useState(0.1);
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  const [pathSelections, setPathSelections] = useState<Record<string, number>>({});
  const [showToolCalls, setShowToolCalls] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("showToolCalls") !== "false";
  });
  const [showThinking, setShowThinking] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("showThinking") !== "false";
  });

  useEffect(() => {
    setPathSelections({});
  }, [data.sessionId]);

  const toggleToolCalls = useCallback(() => {
    setShowToolCalls((prev) => {
      const next = !prev;
      localStorage.setItem("showToolCalls", String(next));
      return next;
    });
  }, []);

  const toggleThinking = useCallback(() => {
    setShowThinking((prev) => {
      const next = !prev;
      localStorage.setItem("showThinking", String(next));
      return next;
    });
  }, []);

  const handlePathSwitch = useCallback((forkUuid: string, pathIndex: number) => {
    setPathSelections((prev) => ({ ...prev, [forkUuid]: pathIndex }));
  }, []);

  const handleBranchClick = useCallback((forkUuid: string, pathIndex: number) => {
    setPathSelections((prev) => ({ ...prev, [forkUuid]: pathIndex }));
    const bp = data.branchPoints.find((b) => b.forkMessageUuid === forkUuid);
    if (bp) setScrollToIndex(bp.messageIndex);
  }, [data.branchPoints]);

  const handleViewportChange = useCallback((top: number, bottom: number) => {
    setViewportTop(top);
    setViewportBottom(bottom);
  }, []);

  const handleScrollComplete = useCallback(() => {
    setScrollToIndex(null);
  }, []);

  return (
    <AppShell>
      <div className="pr-20">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* Back link */}
          <Link to={`/?user=${data.user}&project=${data.projectId}`} className="link-back inline-block mb-4">
            &larr; Back to sessions
          </Link>

          {/* Header */}
          <div className="mb-6">
            <h1 className="heading-display text-xl mb-2">
              {data.firstPrompt || "Session"}
            </h1>
            {data.summary && (
              <p className="text-sm text-slate mb-3">{data.summary}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-slate">
              {data.gitBranch && (
                <span className="bg-panel px-1.5 py-0.5 rounded">{data.gitBranch}</span>
              )}
              <span>{data.messages.length} messages</span>
              {data.subagents.length > 0 && (
                <span className="text-teal">
                  {data.subagents.length} subagent{data.subagents.length !== 1 ? "s" : ""}
                </span>
              )}
              <span>{(data.totalInput + data.totalOutput).toLocaleString()} tokens</span>
              <button
                onClick={toggleThinking}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  showThinking
                    ? "bg-panel text-slate hover:text-ink"
                    : "bg-teal-wash text-teal hover:text-ink"
                }`}
              >
                {showThinking ? "Hide thinking" : "Show thinking"}
              </button>
              <button
                onClick={toggleToolCalls}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  showToolCalls
                    ? "bg-panel text-slate hover:text-ink"
                    : "bg-teal-wash text-teal hover:text-ink"
                }`}
              >
                {showToolCalls ? "Hide tools" : "Show tools"}
              </button>
            </div>
          </div>

          {/* Conversation thread */}
          <InfiniteMessageList
            messages={data.messages}
            branchPoints={data.branchPoints}
            pathSelections={pathSelections}
            onPathSwitch={handlePathSwitch}
            subagentMap={data.subagentMap}
            projectId={data.projectId}
            sessionId={data.sessionId!}
            onViewportChange={handleViewportChange}
            scrollToIndex={scrollToIndex}
            onScrollComplete={handleScrollComplete}
            showToolCalls={showToolCalls}
            showThinking={showThinking}
            userName={data.user || undefined}
          />
        </div>
      </div>

      <ConversationMinimap
        messages={data.messages}
        contentLengths={data.contentLengths}
        branchPoints={data.branchPoints}
        viewportTop={viewportTop}
        viewportBottom={viewportBottom}
        onClickPosition={(index) => setScrollToIndex(index)}
        onClickBranch={handleBranchClick}
      />
    </AppShell>
  );
}
