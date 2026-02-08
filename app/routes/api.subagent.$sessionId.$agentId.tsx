import type { Route } from "./+types/api.subagent.$sessionId.$agentId";
import { ensureInitialized } from "~/lib/db.server";
import { parseSessionFile } from "~/lib/parser.server";
import { buildMessageTree, resolveActivePath } from "~/lib/tree";
import path from "path";

export async function loader({ params }: Route.LoaderArgs) {
  const { sessionId, agentId } = params;
  const db = await ensureInitialized();

  const session = db.prepare(
    "SELECT project_dir_id FROM sessions WHERE session_id = ?",
  ).get(sessionId) as { project_dir_id: string } | undefined;

  if (!session) {
    throw new Response("Session not found", { status: 404 });
  }

  const project = db.prepare("SELECT path FROM projects WHERE dir_id = ?")
    .get(session.project_dir_id) as { path: string } | undefined;

  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  const filePath = path.join(project.path, sessionId!, "subagents", `agent-${agentId}.jsonl`);
  const entries = await parseSessionFile(filePath);
  const roots = buildMessageTree(entries);
  const messages = resolveActivePath(roots);

  return Response.json({ messages });
}
