import { useLoaderData, useSearchParams, Form } from "react-router";
import type { Route } from "./+types/_index";
import { AppShell } from "~/components/layout/AppShell";
import { SessionCard } from "~/components/session/SessionCard";
import { getDb, getProjects, getAllSessions, getSessionsByProject, searchSessions } from "~/lib/db.server";
import type { SessionMeta } from "~/lib/types";

export function meta() {
  return [{ title: "Sessions" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const projectFilter = url.searchParams.get("project");
  const query = url.searchParams.get("q");
  const db = getDb();

  const projects = getProjects(db);

  let sessions: SessionMeta[];
  if (query) {
    sessions = searchSessions(db, query);
  } else if (projectFilter) {
    sessions = getSessionsByProject(db, projectFilter);
  } else {
    sessions = getAllSessions(db);
  }

  return { projects, sessions, projectFilter, query };
}

export default function Index() {
  const { projects, sessions, projectFilter, query } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);

  return (
    <AppShell>
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-edge bg-white px-4 py-6 min-h-[calc(100vh-49px)]">
          <p className="section-label mb-3">Projects</p>
          <nav className="space-y-1">
            <button
              onClick={() => setSearchParams({})}
              className={`block w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                !projectFilter && !query ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
              }`}
            >
              All sessions
              <span className="text-xs text-slate ml-1">({totalSessions})</span>
            </button>
            {projects.map((project) => (
              <button
                key={project.dirId}
                onClick={() => setSearchParams({ project: project.dirId })}
                className={`block w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                  projectFilter === project.dirId ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
                }`}
              >
                {project.name}
                <span className="text-xs text-slate ml-1">({project.sessionCount})</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 px-6 py-6">
          {/* Search */}
          <Form method="get" className="mb-6">
            <input
              type="text"
              name="q"
              placeholder="Search sessions..."
              defaultValue={query || ""}
              className="input-field max-w-md"
            />
            {projectFilter && <input type="hidden" name="project" value={projectFilter} />}
          </Form>

          {/* Results */}
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <p className="text-slate text-sm">No sessions found.</p>
            ) : (
              sessions.map((session) => (
                <SessionCard key={session.sessionId} session={session} />
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
