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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">
            {session.firstPrompt || "No prompt"}
          </p>
          {session.summary && (
            <p className="text-xs text-slate mt-1 line-clamp-2">{session.summary}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate">{formatDate(session.modified)}</p>
          <p className="text-xs text-slate">{formatTime(session.modified)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        {showUser && session.user && (
          <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
            {session.user}
          </span>
        )}
        {session.gitBranch && (
          <span className="text-xs text-slate bg-panel px-1.5 py-0.5 rounded">
            {session.gitBranch}
          </span>
        )}
        <span className="text-xs text-slate">{session.messageCount} messages</span>
        {session.subagentCount > 0 && (
          <span className="text-xs text-teal">
            {session.subagentCount} subagent{session.subagentCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
