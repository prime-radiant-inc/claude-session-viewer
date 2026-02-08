import { readdir, readFile, access, stat } from "fs/promises";
import path from "path";
import type { SessionsIndex } from "./types";

export interface ProjectInfo {
  dirId: string;
  name: string;
  path: string;
}

export interface SessionFileInfo {
  sessionId: string;
  filePath: string;
  mtime: Date;
}

export interface SubagentFileInfo {
  agentId: string;
  filePath: string;
}

export function parseProjectName(dirName: string): string {
  const segments = dirName.slice(1).split("-");
  return segments.slice(2).join("-");
}

export async function discoverProjects(dataDir: string): Promise<ProjectInfo[]> {
  const entries = await readdir(dataDir, { withFileTypes: true });
  const projects: ProjectInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("-")) continue;
    projects.push({
      dirId: entry.name,
      name: parseProjectName(entry.name),
      path: path.join(dataDir, entry.name),
    });
  }

  projects.sort((a, b) => a.dirId.localeCompare(b.dirId));

  // Detect sub-projects by prefix matching: if one project's dirId
  // is a prefix of another's (with a hyphen separator), rewrite the
  // longer name as "parent/suffix".
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      if (projects[j].dirId.startsWith(projects[i].dirId + "-")) {
        const suffix = projects[j].dirId.slice(projects[i].dirId.length + 1);
        projects[j].name = projects[i].name + "/" + suffix;
      }
    }
  }

  return projects;
}

export async function discoverSessions(projectPath: string): Promise<SessionFileInfo[]> {
  const entries = await readdir(projectPath, { withFileTypes: true });
  const sessions: SessionFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const filePath = path.join(projectPath, entry.name);
    const stats = await stat(filePath);
    sessions.push({
      sessionId: entry.name.replace(".jsonl", ""),
      filePath,
      mtime: stats.mtime,
    });
  }

  return sessions;
}

export async function readSessionsIndex(projectPath: string): Promise<SessionsIndex | null> {
  const indexPath = path.join(projectPath, "sessions-index.json");
  try {
    await access(indexPath);
    return JSON.parse(await readFile(indexPath, "utf-8")) as SessionsIndex;
  } catch {
    return null;
  }
}

// =============================================================================
// Multi-user layout discovery
// =============================================================================

export type DataLayout = "single-user" | "multi-user";

export async function detectLayout(dataDir: string): Promise<DataLayout> {
  const entries = await readdir(dataDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 0) return "single-user";
  // If any directory starts with "-", it's the old encoded-path layout
  return dirs.some((d) => d.name.startsWith("-")) ? "single-user" : "multi-user";
}

export async function discoverUsers(dataDir: string): Promise<string[]> {
  const entries = await readdir(dataDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("-") && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

export async function discoverHosts(userDir: string): Promise<string[]> {
  const entries = await readdir(userDir, { withFileTypes: true });
  const hosts: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    // Check if this is a hostname dir (contains project dirs) vs a project dir (contains .jsonl files)
    const subEntries = await readdir(path.join(userDir, entry.name), { withFileTypes: true });
    const hasJsonl = subEntries.some((e) => e.isFile() && e.name.endsWith(".jsonl"));
    if (!hasJsonl) {
      hosts.push(entry.name);
    }
  }

  return hosts.sort();
}

export async function discoverUserProjects(userDir: string, user: string, hostname: string): Promise<ProjectInfo[]> {
  const hostDir = path.join(userDir, hostname);
  const entries = await readdir(hostDir, { withFileTypes: true });
  const projects: ProjectInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    projects.push({
      dirId: `${user}/${hostname}/${entry.name}`,
      name: entry.name.startsWith("-") ? parseProjectName(entry.name) : entry.name,
      path: path.join(hostDir, entry.name),
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));

  // Detect sub-projects by prefix matching on decoded names
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      if (projects[j].name.startsWith(projects[i].name + "-")) {
        const suffix = projects[j].name.slice(projects[i].name.length + 1);
        projects[j].name = projects[i].name + "/" + suffix;
      }
    }
  }

  return projects;
}

export async function discoverSubagents(projectPath: string, sessionId: string): Promise<SubagentFileInfo[]> {
  const subagentDir = path.join(projectPath, sessionId, "subagents");
  try { await access(subagentDir); } catch { return []; }

  const entries = await readdir(subagentDir, { withFileTypes: true });
  const subagents: SubagentFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const match = entry.name.match(/^agent-(.+)\.jsonl$/);
    if (!match) continue;
    subagents.push({ agentId: match[1], filePath: path.join(subagentDir, entry.name) });
  }

  return subagents;
}
