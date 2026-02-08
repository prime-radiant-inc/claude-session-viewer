import { readdir, access, stat } from "fs/promises";
import path from "path";
import type { SessionFileInfo } from "./scanner.server";

/**
 * Walk the Codex sessions directory structure: {codexDir}/sessions/{year}/{month}/{day}/rollout-*.jsonl
 * Extract session UUID from the filename stem (last 5 hyphen-separated segments).
 */
export async function discoverCodexSessions(codexDir: string): Promise<SessionFileInfo[]> {
  const sessionsDir = path.join(codexDir, "sessions");
  try {
    await access(sessionsDir);
  } catch {
    return [];
  }

  const sessions: SessionFileInfo[] = [];

  let years: string[];
  try {
    years = (await readdir(sessionsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const year of years) {
    const yearDir = path.join(sessionsDir, year);
    let months: string[];
    try {
      months = (await readdir(yearDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      continue;
    }

    for (const month of months) {
      const monthDir = path.join(yearDir, month);
      let days: string[];
      try {
        days = (await readdir(monthDir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        continue;
      }

      for (const day of days) {
        const dayDir = path.join(monthDir, day);
        let files: string[];
        try {
          files = (await readdir(dayDir))
            .filter((f) => f.endsWith(".jsonl") && f.startsWith("rollout-"));
        } catch {
          continue;
        }

        for (const file of files) {
          const filePath = path.join(dayDir, file);
          const sessionId = extractSessionId(file);
          if (!sessionId) continue;
          const stats = await stat(filePath);
          sessions.push({ sessionId, filePath, mtime: stats.mtime });
        }
      }
    }
  }

  return sessions;
}

/**
 * Extract UUID from a Codex rollout filename.
 * Format: rollout-{timestamp}-{uuid}.jsonl
 * e.g. rollout-2026-02-03T00-02-31-019c2286-484a-7550-b53b-cd4e1fd7c5e4.jsonl
 * UUID is the last 5 hyphen-separated segments of the stem.
 */
function extractSessionId(filename: string): string | null {
  const stem = filename.replace(".jsonl", "");
  const parts = stem.split("-");
  // UUID is 5 segments: 8-4-4-4-12 hex chars
  if (parts.length < 5) return null;
  const uuidParts = parts.slice(-5);
  return uuidParts.join("-");
}
