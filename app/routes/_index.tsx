import { useLoaderData, useSearchParams, useNavigation, useRevalidator, Form } from "react-router";
import type { Route } from "./+types/_index";
import { AppShell } from "~/components/layout/AppShell";
import { SessionCard } from "~/components/session/SessionCard";
import { ensureInitialized, getProjects, getUsers, getHosts, getAllSessions, getSessionsByProject, searchSessions } from "~/lib/db.server";
import type { SessionMeta } from "~/lib/types";

export function meta() {
  return [{ title: "Sessions" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const projectFilter = url.searchParams.get("project");
  const userFilter = url.searchParams.get("user");
  const hostFilter = url.searchParams.get("host");
  const query = url.searchParams.get("q");
  const admin = url.searchParams.get("admin") === "1";
  const db = await ensureInitialized();

  const users = getUsers(db);
  const hosts = getHosts(db, userFilter || undefined);
  const projects = getProjects(db, userFilter || undefined, hostFilter || undefined, admin);

  let sessions: SessionMeta[];
  if (query) {
    sessions = searchSessions(db, query, 50, userFilter || undefined, admin);
  } else if (projectFilter) {
    sessions = getSessionsByProject(db, projectFilter, 100, 0, admin);
  } else {
    sessions = getAllSessions(db, 100, 0, userFilter || undefined, admin);
  }

  return { users, hosts, projects, sessions, projectFilter, userFilter, hostFilter, query, admin };
}

function formatDateHeader(iso: string): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - sessionDay.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function groupSessionsByDate(sessions: SessionMeta[]): Array<{ label: string; sessions: SessionMeta[] }> {
  const groups: Array<{ label: string; sessions: SessionMeta[] }> = [];
  let currentLabel = "";
  for (const session of sessions) {
    const label = formatDateHeader(session.modified);
    if (label !== currentLabel) {
      groups.push({ label, sessions: [session] });
      currentLabel = label;
    } else {
      groups[groups.length - 1].sessions.push(session);
    }
  }
  return groups;
}

export default function Index() {
  const { users, hosts, projects, sessions, projectFilter, userFilter, hostFilter, query, admin } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = navigation.state === "loading";

  const totalSessions = projects.reduce((sum, p) => sum + p.sessionCount, 0);
  const showUserBadge = users.length > 0 && !userFilter;
  const sessionGroups = groupSessionsByDate(sessions);

  function toggleAdmin() {
    const next = new URLSearchParams(searchParams);
    if (admin) {
      next.delete("admin");
    } else {
      next.set("admin", "1");
    }
    setSearchParams(next);
  }

  async function toggleProjectHidden(name: string, currentlyHidden: number) {
    await fetch("/api/hide-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, hidden: !currentlyHidden }),
    });
    revalidator.revalidate();
  }

  const adminToggle = (
    <button
      onClick={toggleAdmin}
      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
        admin
          ? "bg-amber-100 border-amber-300 text-amber-800"
          : "border-edge text-slate hover:text-ink"
      }`}
    >
      Admin
    </button>
  );

  return (
    <AppShell headerRight={adminToggle}>
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-edge bg-white px-4 py-6 min-h-[calc(100vh-49px)]">
          {/* Users section */}
          {users.length > 0 && (
            <>
              <p className="section-label mb-3">Users</p>
              <nav className="space-y-1 mb-6">
                <button
                  onClick={() => setSearchParams(admin ? { admin: "1" } : {})}
                  className={`block w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                    !userFilter && !projectFilter && !query ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
                  }`}
                >
                  All users
                </button>
                {users.map((user) => (
                  <button
                    key={user}
                    onClick={() => setSearchParams(admin ? { user, admin: "1" } : { user })}
                    className={`block w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      userFilter === user ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
                    }`}
                  >
                    {user}
                  </button>
                ))}
              </nav>
            </>
          )}

          {/* Hosts section */}
          {hosts.length > 0 && userFilter && (
            <>
              <p className="section-label mb-3">Hosts</p>
              <nav className="space-y-1 mb-6">
                <button
                  onClick={() => setSearchParams(admin ? { user: userFilter, admin: "1" } : { user: userFilter })}
                  className={`block w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                    !hostFilter ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
                  }`}
                >
                  All hosts
                </button>
                {hosts.map((host) => (
                  <button
                    key={host}
                    onClick={() => {
                      const p: Record<string, string> = { user: userFilter!, host };
                      if (admin) p.admin = "1";
                      setSearchParams(p);
                    }}
                    className={`block w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      hostFilter === host ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
                    }`}
                  >
                    {host}
                  </button>
                ))}
              </nav>
            </>
          )}

          <p className="section-label mb-3">Projects</p>
          <nav className="space-y-1">
            <button
              onClick={() => {
                const p: Record<string, string> = {};
                if (userFilter) p.user = userFilter;
                if (hostFilter) p.host = hostFilter;
                if (admin) p.admin = "1";
                setSearchParams(p);
              }}
              className={`block w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                !projectFilter && !query ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
              }`}
            >
              All sessions
              <span className="text-xs text-slate ml-1">({totalSessions})</span>
            </button>
            {projects.map((project) => (
              <div key={project.name} className={`flex items-center gap-1 ${project.hidden ? "opacity-40" : ""}`}>
                <button
                  onClick={() => {
                    const p: Record<string, string> = { project: project.name };
                    if (userFilter) p.user = userFilter;
                    if (hostFilter) p.host = hostFilter;
                    if (admin) p.admin = "1";
                    setSearchParams(p);
                  }}
                  className={`flex-1 text-left px-2 py-1.5 rounded text-sm transition-colors ${
                    projectFilter === project.name ? "bg-teal-wash text-teal font-medium" : "text-slate hover:text-ink"
                  }`}
                >
                  {project.name}
                  <span className="text-xs text-slate ml-1">({project.sessionCount})</span>
                </button>
                {admin && (
                  <button
                    onClick={() => toggleProjectHidden(project.name, project.hidden)}
                    className="shrink-0 text-xs px-1.5 py-0.5 rounded border border-edge hover:bg-panel transition-colors"
                    title={project.hidden ? "Unhide project" : "Hide project"}
                  >
                    {project.hidden ? "Show" : "Hide"}
                  </button>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className={`flex-1 px-6 py-6 transition-opacity ${isLoading ? "opacity-60" : ""}`}>
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
            {userFilter && <input type="hidden" name="user" value={userFilter} />}
            {hostFilter && <input type="hidden" name="host" value={hostFilter} />}
            {admin && <input type="hidden" name="admin" value="1" />}
          </Form>

          {/* Results */}
          <div>
            {sessions.length === 0 ? (
              <p className="text-slate text-sm">No sessions found.</p>
            ) : (
              sessionGroups.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="section-label mb-2">{group.label}</p>
                  <div className="space-y-2">
                    {group.sessions.map((session) => (
                      <SessionCard key={session.sessionId} session={session} showUser={showUserBadge} admin={admin} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
