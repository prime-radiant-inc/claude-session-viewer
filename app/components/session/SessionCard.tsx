import { Link } from "react-router";
import type { SessionMeta } from "~/lib/types";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function SessionCard({ session, showUser }: { session: SessionMeta; showUser?: boolean }) {
  return (
    <Link
      to={`/sessions/${session.projectId}/${session.sessionId}`}
      className="card block px-4 py-3"
    >
      <p className="text-sm font-medium text-ink line-clamp-2">
        {session.firstPrompt || "No prompt"}
      </p>
      {session.summary && (
        <p className="text-xs text-slate mt-1 line-clamp-2">{session.summary}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate">
        <span>{formatDate(session.modified)} {formatTime(session.modified)}</span>
        {showUser && session.user && (
          <span className="text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
            {session.user}
          </span>
        )}
        {session.gitBranch && (
          <span className="bg-panel px-1.5 py-0.5 rounded">
            {session.gitBranch}
          </span>
        )}
        <span>{session.messageCount} messages</span>
        {session.subagentCount > 0 && (
          <span className="text-teal">
            {session.subagentCount} subagent{session.subagentCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
