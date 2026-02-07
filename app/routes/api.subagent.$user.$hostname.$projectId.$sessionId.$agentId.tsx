import type { Route } from "./+types/api.subagent.$user.$hostname.$projectId.$sessionId.$agentId";
import { ensureInitialized } from "~/lib/db.server";
import { parseSessionFile, buildConversationThread } from "~/lib/parser.server";
import path from "path";

export async function loader({ params }: Route.LoaderArgs) {
  const { user, hostname, projectId, sessionId, agentId } = params;
  const dirId = `${user}/${hostname}/${projectId}`;
  const db = await ensureInitialized();

  const project = db.prepare("SELECT path FROM projects WHERE dir_id = ?")
    .get(dirId) as { path: string } | undefined;

  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  const filePath = path.join(project.path, sessionId!, "subagents", `agent-${agentId}.jsonl`);
  const entries = await parseSessionFile(filePath);
  const messages = buildConversationThread(entries);

  return Response.json({ messages });
}
