import { useState, useCallback } from "react";
import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/sessions.$projectId.$sessionId";
import { AppShell } from "~/components/layout/AppShell";
import { InfiniteMessageList } from "~/components/session/InfiniteMessageList";
import { ConversationMinimap } from "~/components/session/ConversationMinimap";
import { getDb } from "~/lib/db.server";
import { estimateContentLength } from "~/lib/minimap";
import { parseSessionFile, buildConversationThread, readSubagentFirstPrompt } from "~/lib/parser.server";
import { discoverSubagents } from "~/lib/scanner.server";

export function meta({ data }: Route.MetaArgs) {
  const title = data?.firstPrompt
    ? `${data.firstPrompt.slice(0, 60)} | Sessions`
    : "Session | Sessions";
  return [{ title }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const { projectId, sessionId } = params;
  const db = getDb();

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

  const project = db.prepare("SELECT path FROM projects WHERE dir_id = ?")
    .get(projectId) as { path: string } | undefined;

  const entries = await parseSessionFile(session.file_path);
  const messages = buildConversationThread(entries);

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

  return {
    sessionId,
    projectId,
    firstPrompt: session.first_prompt,
    summary: session.summary,
    created: session.created,
    modified: session.modified,
    gitBranch: session.git_branch,
    messages,
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

  const handleViewportChange = useCallback((top: number, bottom: number) => {
    setViewportTop(top);
    setViewportBottom(bottom);
  }, []);

  const handleScrollComplete = useCallback(() => {
    setScrollToIndex(null);
  }, []);

  return (
    <AppShell>
      <div className="pr-16">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* Back link */}
          <Link to={`/?project=${data.projectId}`} className="link-back inline-block mb-4">
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
            </div>
          </div>

          {/* Conversation thread */}
          <InfiniteMessageList
            messages={data.messages}
            subagentMap={data.subagentMap}
            projectId={data.projectId}
            sessionId={data.sessionId}
            onViewportChange={handleViewportChange}
            scrollToIndex={scrollToIndex}
            onScrollComplete={handleScrollComplete}
          />
        </div>
      </div>

      <ConversationMinimap
        messages={data.messages}
        contentLengths={data.contentLengths}
        viewportTop={viewportTop}
        viewportBottom={viewportBottom}
        onClickPosition={(index) => setScrollToIndex(index)}
      />
    </AppShell>
  );
}
