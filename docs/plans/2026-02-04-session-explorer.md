# Session Explorer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web app for browsing, searching, and reading Claude Code session logs with full subagent/sidechain support.

**Architecture:** React Router 7 SSR app reading from a configurable data directory of JSONL session logs. SQLite (via better-sqlite3) indexes session metadata for fast listing/search with FTS5. Individual session content is stream-parsed from JSONL on demand. Superpowers Suite style guide for visual identity.

**Tech Stack:** React Router 7, Tailwind CSS 4, better-sqlite3 with FTS5, TypeScript, Vite, Express

**Reference:** Superpowers Suite Style Guide at `/Users/jesse/prime-radiant/brainstorm/docs/style-guide.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `react-router.config.ts`
- Create: `server.js`
- Create: `server/app.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `app/app.css`
- Create: `app/root.tsx`
- Create: `app/components/layout/AppShell.tsx`
- Create: `app/routes/_index.tsx`
- Create: `public/favicon.svg`
- Create: `env.d.ts`

**Step 1: Create package.json and install dependencies**

```json
{
  "name": "session-explorer",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server.js",
    "build": "react-router build",
    "start": "NODE_ENV=production node server.js",
    "test": "vitest",
    "db:init": "node -e \"import('./app/lib/db.server.ts').then(m => m.initDb())\""
  },
  "dependencies": {
    "@react-router/express": "^7.1.0",
    "@react-router/fs-routes": "^7.13.0",
    "@react-router/node": "^7.1.0",
    "@tailwindcss/typography": "^0.5.19",
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.0.0",
    "express": "^4.21.0",
    "isbot": "^5.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^10.1.0",
    "react-router": "^7.1.0"
  },
  "devDependencies": {
    "@react-router/dev": "^7.1.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^5.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

Run: `cd /Users/jesse/prime-radiant/session-explorer && npm install`

**Step 2: Create config files**

`tsconfig.json`:

```json
{
  "include": ["env.d.ts", "**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "types": ["vite/client"],
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": { "~/*": ["./app/*"] },
    "rootDirs": [".", "./.react-router/types"]
  }
}
```

`env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`vite.config.ts`:

```ts
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: { "~": path.resolve(__dirname, "./app") },
  },
});
```

`react-router.config.ts`:

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: { "~": path.resolve(__dirname, "./app") },
  },
});
```

`server.js`:

```js
if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

import express from "express";

const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV !== "production";
const PORT = Number.parseInt(process.env.PORT || "3000");

const server = express();

if (DEVELOPMENT) {
  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({ server: { middlewareMode: true } })
  );
  server.use(viteDevServer.middlewares);
  server.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule("./server/app.ts");
      return await source.app(req, res, next);
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  server.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
  server.use(express.static("build/client", { maxAge: "1h" }));
  server.use(await import(BUILD_PATH).then((mod) => mod.app));
}

server.listen(PORT, () => {
  console.log(`Session Explorer running on http://localhost:${PORT}`);
});
```

`server/app.ts`:

```ts
import { createRequestHandler } from "@react-router/express";
import express from "express";

export const app = express();

app.all(
  "*",
  createRequestHandler({
    // @ts-expect-error - virtual import provided by React Router
    build: () => import("virtual:react-router/server-build"),
  })
);
```

`.env.example`:

```
DATA_DIR=/Users/jesse/.claude/projects
PORT=3000
```

`.gitignore`:

```
node_modules/
build/
.react-router/
*.db
.env
```

**Step 3: Implement the Superpowers Suite design system**

Follow the style guide's Implementation Checklist (`/Users/jesse/prime-radiant/brainstorm/docs/style-guide.md` lines 285-297):

1. Install Tailwind CSS 4 + typography (done in step 1)
2. Add the `@theme` block with design system tokens
3. Load Fraunces and DM Sans from Google Fonts
4. Set body defaults
5. Implement the component classes our app needs
6. Create favicon with "S" initial
7. Use `{Page} | Sessions` title format
8. Set `bg-surface` on root

`app/app.css` -- design system tokens from style guide, plus component classes we need:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

/* Superpowers Suite design tokens (from style guide) */
@theme {
  --color-ink: #1b2631;
  --color-ink-light: #374a5e;
  --color-slate: #6b7c8f;
  --color-teal: #1a6b5a;
  --color-teal-light: #d4ece8;
  --color-teal-wash: #eaf5f2;
  --color-surface: #f6f8fa;
  --color-panel: #eef1f5;
  --color-edge: #e1e4e8;
  --color-edge-light: #eef1f5;

  --font-display: 'Fraunces', serif;
  --font-body: 'DM Sans', sans-serif;
}

body {
  font-family: var(--font-body);
  color: var(--color-ink);
}

/* Component classes per style guide */

.btn-primary {
  background-color: var(--color-teal);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.15s;
}
.btn-primary:hover { background-color: color-mix(in srgb, var(--color-teal) 90%, black); }
.btn-primary:disabled { opacity: 0.5; }

.card {
  background: white;
  border: 1px solid var(--color-edge);
  border-radius: 0.5rem;
  transition: border-color 0.15s;
}
.card:hover { border-color: color-mix(in srgb, var(--color-teal) 40%, transparent); }

.input-field {
  width: 100%;
  border: 1px solid var(--color-edge);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}
.input-field:focus {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-teal) 30%, transparent);
  border-color: var(--color-teal);
}
.input-field:disabled { opacity: 0.5; }

.heading-display {
  font-family: var(--font-display);
  font-weight: 500;
  color: var(--color-ink);
}

.section-label {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-slate);
}

.link-back {
  font-size: 0.75rem;
  color: var(--color-slate);
  transition: color 0.15s;
}
.link-back:hover { color: var(--color-ink); }

.link-subtle {
  font-size: 0.875rem;
  color: var(--color-slate);
  transition: color 0.15s;
}
.link-subtle:hover { color: var(--color-ink); }
```

`app/root.tsx`:

```tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError, isRouteErrorResponse, Link } from "react-router";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="heading-display text-4xl mb-2">{error.status}</h1>
          <p className="text-slate mb-6">{error.statusText || "Something went wrong"}</p>
          <Link to="/" className="btn-primary">Back to sessions</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="heading-display text-2xl mb-2">Something went wrong</h1>
        <p className="text-slate mb-6">An unexpected error occurred.</p>
        <Link to="/" className="btn-primary">Back to sessions</Link>
      </div>
    </div>
  );
}
```

`app/components/layout/AppShell.tsx` -- wordmark in Fraunces italic per style guide:

```tsx
import { Link } from "react-router";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-edge px-6 py-3">
        <Link to="/" className="font-display text-lg font-medium italic text-ink">
          Sessions
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

`app/routes/_index.tsx` (placeholder):

```tsx
import { AppShell } from "~/components/layout/AppShell";

export function meta() {
  return [{ title: "Sessions" }];
}

export default function Index() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="heading-display text-2xl mb-4">Sessions</h1>
        <p className="text-slate">Loading...</p>
      </div>
    </AppShell>
  );
}
```

`public/favicon.svg` -- dark rect + teal "S" initial per style guide:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#2d3748"/>
  <text x="16" y="23" font-family="serif" font-size="20" font-weight="bold" fill="#5ba3a3" text-anchor="middle">S</text>
</svg>
```

**Step 4: Verify dev server starts**

Run: `cd /Users/jesse/prime-radiant/session-explorer && cp .env.example .env && npm run dev`
Expected: Server starts on localhost:3000, shows "Sessions" heading in Fraunces font on surface background.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with Superpowers Suite design system"
```

---

## Task 2: TypeScript Types for Session Logs

**Files:**
- Create: `app/lib/types.ts`
- Test: `tests/types.test.ts`

**Step 1: Define types based on research of actual JSONL format**

`app/lib/types.ts`:

```ts
// Raw JSONL entry -- union of all possible fields across message types
export interface RawLogEntry {
  type: "user" | "assistant" | "system" | "progress" | "summary" | "file-history-snapshot" | "queue-operation";
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  agentId?: string;
  slug?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  userType?: string;
  requestId?: string;
  toolUseID?: string;
  parentToolUseID?: string;
  sourceToolAssistantUUID?: string;
  message?: ApiMessage;
  toolUseResult?: string | Record<string, unknown>;
  summary?: string;
  leafUuid?: string;
  data?: ProgressData;
  subtype?: string;
  durationMs?: number;
  messageId?: string;
  snapshot?: Record<string, unknown>;
  isSnapshotUpdate?: boolean;
  operation?: string;
  content?: string;
  thinkingMetadata?: { level?: string; disabled?: boolean; maxThinkingTokens?: number };
  todos?: unknown[];
  permissionMode?: string;
}

export interface ApiMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  model?: string;
  id?: string;
  type?: string;
  stop_reason?: string | null;
  usage?: TokenUsage;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
}

export interface ProgressData {
  type: string;
  hookEvent?: string;
  hookName?: string;
  command?: string;
  message?: Record<string, unknown>;
}

// Parsed and display-ready types

export interface SessionMeta {
  sessionId: string;
  projectId: string;
  projectName: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  subagentCount: number;
}

export interface ParsedMessage {
  uuid: string;
  parentUuid: string | null;
  type: "user" | "assistant" | "system";
  timestamp: string;
  content: ContentBlock[];
  model?: string;
  usage?: TokenUsage;
  isSidechain: boolean;
  toolResultId?: string;
  isToolResult?: boolean;
  isError?: boolean;
  subagentId?: string;
  subagentDescription?: string;
}

export interface SubagentInfo {
  agentId: string;
  slug?: string;
  description?: string;
  toolUseId: string;
  messageCount: number;
}

export interface SessionDetail {
  meta: SessionMeta;
  messages: ParsedMessage[];
  subagents: SubagentInfo[];
}

export interface SessionsIndex {
  version: number;
  entries: SessionsIndexEntry[];
}

export interface SessionsIndexEntry {
  sessionId: string;
  fullPath: string;
  fileMtime?: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
}
```

**Step 2: Write type validation tests**

`tests/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { RawLogEntry, SessionsIndexEntry } from "~/lib/types";

describe("types", () => {
  it("RawLogEntry accepts a user message", () => {
    const entry: RawLogEntry = {
      type: "user",
      uuid: "abc-123",
      parentUuid: null,
      sessionId: "session-1",
      timestamp: "2026-01-21T23:26:32.460Z",
      isSidechain: false,
      message: { role: "user", content: "hello world" },
    };
    expect(entry.type).toBe("user");
  });

  it("RawLogEntry accepts an assistant message with tool_use", () => {
    const entry: RawLogEntry = {
      type: "assistant",
      uuid: "abc-456",
      parentUuid: "abc-123",
      sessionId: "session-1",
      timestamp: "2026-01-21T23:26:35Z",
      isSidechain: false,
      message: {
        role: "assistant",
        model: "claude-opus-4-5-20251101",
        content: [
          { type: "thinking", thinking: "Let me think...", signature: "sig" },
          { type: "tool_use", id: "toolu_01X", name: "Read", input: { file_path: "/tmp/test" } },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    expect(entry.type).toBe("assistant");
  });

  it("RawLogEntry accepts a summary", () => {
    const entry: RawLogEntry = { type: "summary", summary: "Fixed the bug", leafUuid: "abc-789" };
    expect(entry.summary).toBe("Fixed the bug");
  });

  it("SessionsIndexEntry matches index file shape", () => {
    const entry: SessionsIndexEntry = {
      sessionId: "860e0e2a",
      fullPath: "/path/to/860e0e2a.jsonl",
      firstPrompt: "hello",
      summary: "User logged in",
      messageCount: 2,
      created: "2026-01-21T17:30:38Z",
      modified: "2026-01-21T17:30:38Z",
      gitBranch: "",
      projectPath: "/Users/jesse/prime-radiant",
      isSidechain: false,
    };
    expect(entry.sessionId).toBeTruthy();
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run tests/types.test.ts`
Expected: All 4 tests pass.

**Step 4: Commit**

```bash
git add app/lib/types.ts tests/types.test.ts
git commit -m "feat: TypeScript types for session log entries and index"
```

---

## Task 3: JSONL Parser

**Files:**
- Create: `app/lib/parser.server.ts`
- Create: `tests/parser.test.ts`
- Create: `tests/fixtures/simple-session.jsonl`
- Create: `tests/fixtures/tool-use-session.jsonl`
- Create: `tests/fixtures/subagent-session.jsonl`

**Step 1: Create test fixtures**

`tests/fixtures/simple-session.jsonl` -- minimal 4-message session:

```jsonl
{"type":"user","uuid":"u1","parentUuid":null,"sessionId":"s1","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"What is 2+2?"},"thinkingMetadata":{"level":"high"}}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"s1","timestamp":"2026-01-21T10:00:01Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"thinking","thinking":"Simple math.","signature":"sig1"},{"type":"text","text":"2+2 equals 4."}],"model":"claude-opus-4-5-20251101","usage":{"input_tokens":10,"output_tokens":5}}}
{"type":"system","uuid":"sys1","parentUuid":"a1","sessionId":"s1","timestamp":"2026-01-21T10:00:02Z","isSidechain":false,"subtype":"turn_duration","durationMs":1500}
{"type":"summary","summary":"Simple math question","leafUuid":"a1"}
```

`tests/fixtures/tool-use-session.jsonl` -- session with tool calls:

```jsonl
{"type":"user","uuid":"u1","parentUuid":null,"sessionId":"s2","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"Read the file /tmp/test.txt"}}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"s2","timestamp":"2026-01-21T10:00:01Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"Let me read that file."},{"type":"tool_use","id":"toolu_01X","name":"Read","input":{"file_path":"/tmp/test.txt"}}],"model":"claude-opus-4-5-20251101","usage":{"input_tokens":10,"output_tokens":20}}}
{"type":"user","uuid":"u2","parentUuid":"a1","sessionId":"s2","timestamp":"2026-01-21T10:00:02Z","isSidechain":false,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01X","content":"hello world","is_error":false}]},"sourceToolAssistantUUID":"a1"}
{"type":"assistant","uuid":"a2","parentUuid":"u2","sessionId":"s2","timestamp":"2026-01-21T10:00:03Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"The file contains: hello world"}],"model":"claude-opus-4-5-20251101","usage":{"input_tokens":30,"output_tokens":10}}}
{"type":"summary","summary":"Read a file","leafUuid":"a2"}
```

`tests/fixtures/subagent-session.jsonl` -- session dispatching a subagent:

```jsonl
{"type":"user","uuid":"u1","parentUuid":null,"sessionId":"s3","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"Explore the codebase"}}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"s3","timestamp":"2026-01-21T10:00:01Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_01T","name":"Task","input":{"description":"Explore codebase structure","prompt":"Find all TypeScript files","subagent_type":"Explore"}}],"model":"claude-opus-4-5-20251101","usage":{"input_tokens":10,"output_tokens":20}}}
{"type":"user","uuid":"u2","parentUuid":"a1","sessionId":"s3","timestamp":"2026-01-21T10:00:30Z","isSidechain":false,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01T","content":"Found 42 TypeScript files across 8 directories.","is_error":false}]},"sourceToolAssistantUUID":"a1"}
{"type":"assistant","uuid":"a2","parentUuid":"u2","sessionId":"s3","timestamp":"2026-01-21T10:00:31Z","isSidechain":false,"message":{"role":"assistant","content":[{"type":"text","text":"I found 42 TypeScript files."}],"model":"claude-opus-4-5-20251101","usage":{"input_tokens":50,"output_tokens":10}}}
{"type":"summary","summary":"Explored codebase","leafUuid":"a2"}
```

**Step 2: Write failing tests**

`tests/parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSessionFile, buildConversationThread } from "~/lib/parser.server";
import path from "path";

const FIXTURES = path.resolve(__dirname, "fixtures");

describe("parseSessionFile", () => {
  it("parses a simple session into entries", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    expect(entries.length).toBe(4);
    expect(entries[0].type).toBe("user");
    expect(entries[1].type).toBe("assistant");
    expect(entries[2].type).toBe("system");
    expect(entries[3].type).toBe("summary");
  });

  it("returns empty array for nonexistent file", async () => {
    const entries = await parseSessionFile("/nonexistent/file.jsonl");
    expect(entries).toEqual([]);
  });
});

describe("buildConversationThread", () => {
  it("filters to user/assistant messages and orders by timestamp", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread.length).toBe(2);
    expect(thread[0].type).toBe("user");
    expect(thread[1].type).toBe("assistant");
  });

  it("extracts text content from user messages", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    const textBlock = thread[0].content.find((b) => b.type === "text");
    expect(textBlock).toBeDefined();
    if (textBlock?.type === "text") expect(textBlock.text).toBe("What is 2+2?");
  });

  it("preserves thinking and text blocks in assistant messages", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread[1].content.length).toBe(2);
    expect(thread[1].content[0].type).toBe("thinking");
    expect(thread[1].content[1].type).toBe("text");
  });

  it("pairs tool_use with tool_result", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "tool-use-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread.length).toBe(4);
    expect(thread[1].content.some((b) => b.type === "tool_use")).toBe(true);
    expect(thread[2].isToolResult).toBe(true);
    expect(thread[2].toolResultId).toBe("toolu_01X");
  });

  it("identifies subagent dispatches", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "subagent-session.jsonl"));
    const thread = buildConversationThread(entries);
    const dispatch = thread.find((m) => m.subagentId);
    expect(dispatch).toBeDefined();
    expect(dispatch?.subagentDescription).toBe("Explore codebase structure");
  });

  it("includes token usage and model on assistant messages", async () => {
    const entries = await parseSessionFile(path.join(FIXTURES, "simple-session.jsonl"));
    const thread = buildConversationThread(entries);
    expect(thread[1].usage?.input_tokens).toBe(10);
    expect(thread[1].model).toBe("claude-opus-4-5-20251101");
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/parser.test.ts`
Expected: FAIL -- module not found.

**Step 4: Implement the parser**

`app/lib/parser.server.ts`:

```ts
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { access } from "fs/promises";
import type { RawLogEntry, ParsedMessage, ContentBlock } from "./types";

export async function parseSessionFile(filePath: string): Promise<RawLogEntry[]> {
  try {
    await access(filePath);
  } catch {
    return [];
  }

  const entries: RawLogEntry[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as RawLogEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

export function buildConversationThread(entries: RawLogEntry[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const entry of entries) {
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (!entry.uuid || !entry.message) continue;
    if (entry.isMeta) continue;

    const content = normalizeContent(entry.message.content);

    const toolResultBlock = content.find((b) => b.type === "tool_result");
    const isToolResult = !!toolResultBlock;
    const toolResultId = toolResultBlock?.type === "tool_result" ? toolResultBlock.tool_use_id : undefined;

    let subagentId: string | undefined;
    let subagentDescription: string | undefined;
    for (const block of content) {
      if (block.type === "tool_use" && block.name === "Task") {
        subagentId = block.id;
        subagentDescription = (block.input as Record<string, unknown>).description as string | undefined;
      }
    }

    messages.push({
      uuid: entry.uuid,
      parentUuid: entry.parentUuid ?? null,
      type: entry.type,
      timestamp: entry.timestamp ?? "",
      content,
      model: entry.message.model,
      usage: entry.message.usage,
      isSidechain: entry.isSidechain ?? false,
      isToolResult,
      toolResultId,
      subagentId,
      subagentDescription,
    });
  }

  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return messages;
}

function normalizeContent(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

export function extractSummary(entries: RawLogEntry[]): string | undefined {
  return entries.find((e) => e.type === "summary")?.summary;
}

export function extractFirstPrompt(entries: RawLogEntry[]): string {
  for (const entry of entries) {
    if (entry.type !== "user" || entry.isMeta) continue;
    const content = entry.message?.content;
    if (typeof content === "string") return content.slice(0, 200);
    if (Array.isArray(content)) {
      const text = content.find((b) => b.type === "text");
      if (text?.type === "text") return text.text.slice(0, 200);
    }
  }
  return "No prompt";
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/parser.test.ts`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add app/lib/parser.server.ts tests/parser.test.ts tests/fixtures/
git commit -m "feat: JSONL session parser with conversation thread building"
```

---

## Task 4: Directory Scanner

**Files:**
- Create: `app/lib/scanner.server.ts`
- Test: `tests/scanner.test.ts`

**Step 1: Write failing tests**

`tests/scanner.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { discoverProjects, discoverSessions, discoverSubagents, parseProjectName } from "~/lib/scanner.server";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(path.join(tmpdir(), "se-test-"));
  const p1 = path.join(testDir, "-Users-jesse-prime-radiant");
  mkdirSync(p1);
  writeFileSync(path.join(p1, "aaa-111.jsonl"), '{"type":"user"}\n');
  writeFileSync(path.join(p1, "bbb-222.jsonl"), '{"type":"user"}\n');
  writeFileSync(path.join(p1, "sessions-index.json"), '{"version":1,"entries":[]}');
  const sub = path.join(p1, "aaa-111", "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(path.join(sub, "agent-abc123.jsonl"), '{"type":"user"}\n');
  const p2 = path.join(testDir, "-Users-jesse-prime-radiant-scribble");
  mkdirSync(p2);
  writeFileSync(path.join(p2, "ccc-333.jsonl"), '{"type":"user"}\n');
});

afterEach(() => { rmSync(testDir, { recursive: true, force: true }); });

describe("parseProjectName", () => {
  it("extracts project name from encoded directory name", () => {
    expect(parseProjectName("-Users-jesse-prime-radiant")).toBe("prime-radiant");
  });
  it("handles nested project paths", () => {
    expect(parseProjectName("-Users-jesse-prime-radiant-scribble")).toBe("prime-radiant/scribble");
  });
});

describe("discoverProjects", () => {
  it("finds all project directories", async () => {
    const projects = await discoverProjects(testDir);
    expect(projects.length).toBe(2);
    expect(projects.map((p) => p.name).sort()).toEqual(["prime-radiant", "prime-radiant/scribble"]);
  });
});

describe("discoverSessions", () => {
  it("finds JSONL session files", async () => {
    const sessions = await discoverSessions(path.join(testDir, "-Users-jesse-prime-radiant"));
    expect(sessions.map((s) => s.sessionId).sort()).toEqual(["aaa-111", "bbb-222"]);
  });
});

describe("discoverSubagents", () => {
  it("finds subagent files for a session", async () => {
    const subs = await discoverSubagents(path.join(testDir, "-Users-jesse-prime-radiant"), "aaa-111");
    expect(subs.length).toBe(1);
    expect(subs[0].agentId).toBe("abc123");
  });
  it("returns empty when no subagents", async () => {
    const subs = await discoverSubagents(path.join(testDir, "-Users-jesse-prime-radiant"), "bbb-222");
    expect(subs).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scanner.test.ts`
Expected: FAIL -- module not found.

**Step 3: Implement the scanner**

`app/lib/scanner.server.ts`:

```ts
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

  // Detect sub-projects by prefix matching
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
```

**Step 4: Run tests**

Run: `npx vitest run tests/scanner.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add app/lib/scanner.server.ts tests/scanner.test.ts
git commit -m "feat: directory scanner for projects, sessions, and subagents"
```

---

## Task 5: SQLite Database and Import

**Files:**
- Create: `app/lib/db.server.ts`
- Test: `tests/db.test.ts`

**Step 1: Write failing tests**

`tests/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { createDb, importFromDataDir, searchSessions, getSessionsByProject, getProjects } from "~/lib/db.server";
import type Database from "better-sqlite3";

let testDir: string;
let db: Database.Database;

beforeEach(() => {
  testDir = mkdtempSync(path.join(tmpdir(), "se-db-test-"));
  const projectDir = path.join(testDir, "-Users-jesse-prime-radiant");
  mkdirSync(projectDir);
  writeFileSync(path.join(projectDir, "aaa-111.jsonl"),
    '{"type":"user","uuid":"u1","sessionId":"aaa-111","timestamp":"2026-01-21T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"fix the login bug"}}\n{"type":"summary","summary":"Fixed authentication bug","leafUuid":"u1"}\n');
  writeFileSync(path.join(projectDir, "bbb-222.jsonl"),
    '{"type":"user","uuid":"u2","sessionId":"bbb-222","timestamp":"2026-01-22T10:00:00Z","isSidechain":false,"message":{"role":"user","content":"add dark mode support"}}\n{"type":"summary","summary":"Added dark mode","leafUuid":"u2"}\n');
  writeFileSync(path.join(projectDir, "sessions-index.json"), JSON.stringify({
    version: 1,
    entries: [
      { sessionId: "aaa-111", fullPath: path.join(projectDir, "aaa-111.jsonl"), firstPrompt: "fix the login bug", summary: "Fixed authentication bug", messageCount: 10, created: "2026-01-21T10:00:00Z", modified: "2026-01-21T11:00:00Z", gitBranch: "main", projectPath: "/Users/jesse/prime-radiant", isSidechain: false },
      { sessionId: "bbb-222", fullPath: path.join(projectDir, "bbb-222.jsonl"), firstPrompt: "add dark mode support", summary: "Added dark mode", messageCount: 20, created: "2026-01-22T10:00:00Z", modified: "2026-01-22T12:00:00Z", gitBranch: "feat/dark-mode", projectPath: "/Users/jesse/prime-radiant", isSidechain: false },
    ],
  }));
  const subDir = path.join(projectDir, "aaa-111", "subagents");
  mkdirSync(subDir, { recursive: true });
  writeFileSync(path.join(subDir, "agent-x1.jsonl"), '{"type":"user"}\n');
  db = createDb(":memory:");
});

afterEach(() => { db.close(); rmSync(testDir, { recursive: true, force: true }); });

describe("createDb", () => {
  it("creates tables and FTS index", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("projects");
    expect(names).toContain("sessions");
    expect(names).toContain("sessions_fts");
  });
});

describe("importFromDataDir", () => {
  it("imports projects and sessions", async () => {
    await importFromDataDir(db, testDir);
    const projects = getProjects(db);
    expect(projects.length).toBe(1);
    const sessions = getSessionsByProject(db, projects[0].dirId);
    expect(sessions.length).toBe(2);
  });

  it("populates session metadata from index", async () => {
    await importFromDataDir(db, testDir);
    const projects = getProjects(db);
    const sessions = getSessionsByProject(db, projects[0].dirId);
    const s = sessions.find((s) => s.sessionId === "aaa-111");
    expect(s?.summary).toBe("Fixed authentication bug");
    expect(s?.firstPrompt).toBe("fix the login bug");
    expect(s?.subagentCount).toBe(1);
  });
});

describe("searchSessions", () => {
  it("finds sessions by summary text", async () => {
    await importFromDataDir(db, testDir);
    const results = searchSessions(db, "authentication");
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe("aaa-111");
  });

  it("finds sessions by first prompt text", async () => {
    await importFromDataDir(db, testDir);
    const results = searchSessions(db, "dark mode");
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe("bbb-222");
  });

  it("returns empty for no matches", async () => {
    await importFromDataDir(db, testDir);
    expect(searchSessions(db, "nonexistent xyz")).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL.

**Step 3: Implement the database module**

`app/lib/db.server.ts`:

```ts
import Database from "better-sqlite3";
import { discoverProjects, discoverSessions, discoverSubagents, readSessionsIndex } from "./scanner.server";
import { parseSessionFile, extractSummary, extractFirstPrompt } from "./parser.server";
import type { SessionMeta } from "./types";

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      dir_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      project_dir_id TEXT NOT NULL REFERENCES projects(dir_id),
      first_prompt TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      message_count INTEGER NOT NULL DEFAULT 0,
      subagent_count INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL DEFAULT '',
      modified TEXT NOT NULL DEFAULT '',
      git_branch TEXT NOT NULL DEFAULT '',
      project_path TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL DEFAULT '',
      file_mtime REAL NOT NULL DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      session_id UNINDEXED,
      first_prompt,
      summary,
      content=sessions,
      content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
      INSERT INTO sessions_fts(rowid, session_id, first_prompt, summary)
      VALUES (new.rowid, new.session_id, new.first_prompt, new.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, session_id, first_prompt, summary)
      VALUES ('delete', old.rowid, old.session_id, old.first_prompt, old.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, session_id, first_prompt, summary)
      VALUES ('delete', old.rowid, old.session_id, old.first_prompt, old.summary);
      INSERT INTO sessions_fts(rowid, session_id, first_prompt, summary)
      VALUES (new.rowid, new.session_id, new.first_prompt, new.summary);
    END;
  `);

  return db;
}

export async function importFromDataDir(db: Database.Database, dataDir: string): Promise<void> {
  const projects = await discoverProjects(dataDir);
  const upsertProject = db.prepare("INSERT OR REPLACE INTO projects (dir_id, name, path) VALUES (?, ?, ?)");
  const upsertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions
    (session_id, project_dir_id, first_prompt, summary, message_count, subagent_count,
     created, modified, git_branch, project_path, file_path, file_mtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getSessionMtime = db.prepare("SELECT file_mtime FROM sessions WHERE session_id = ?");

  for (const project of projects) {
    upsertProject.run(project.dirId, project.name, project.path);

    const index = await readSessionsIndex(project.path);
    const sessionFiles = await discoverSessions(project.path);
    const indexedIds = new Set(index?.entries.map((e) => e.sessionId) ?? []);

    if (index) {
      for (const entry of index.entries) {
        if (entry.isSidechain) continue;
        const fileInfo = sessionFiles.find((s) => s.sessionId === entry.sessionId);
        const mtime = fileInfo?.mtime.getTime() ?? 0;
        const existing = getSessionMtime.get(entry.sessionId) as { file_mtime: number } | undefined;
        if (existing && existing.file_mtime >= mtime) continue;
        const subagents = await discoverSubagents(project.path, entry.sessionId);
        upsertSession.run(entry.sessionId, project.dirId, entry.firstPrompt, entry.summary,
          entry.messageCount, subagents.length, entry.created, entry.modified,
          entry.gitBranch, entry.projectPath, fileInfo?.filePath ?? "", mtime);
      }
    }

    for (const fileInfo of sessionFiles) {
      if (indexedIds.has(fileInfo.sessionId)) continue;
      const existing = getSessionMtime.get(fileInfo.sessionId) as { file_mtime: number } | undefined;
      if (existing && existing.file_mtime >= fileInfo.mtime.getTime()) continue;
      const entries = await parseSessionFile(fileInfo.filePath);
      const summary = extractSummary(entries) ?? "";
      const firstPrompt = extractFirstPrompt(entries);
      const messageCount = entries.filter((e) => (e.type === "user" || e.type === "assistant") && !e.isMeta).length;
      const subagents = await discoverSubagents(project.path, fileInfo.sessionId);
      const timestamps = entries.filter((e) => e.timestamp).map((e) => e.timestamp!);
      upsertSession.run(fileInfo.sessionId, project.dirId, firstPrompt, summary, messageCount,
        subagents.length, timestamps[0] ?? "", timestamps[timestamps.length - 1] ?? "",
        entries[0]?.gitBranch ?? "", entries[0]?.cwd ?? "", fileInfo.filePath, fileInfo.mtime.getTime());
    }
  }
}

export function getProjects(db: Database.Database): Array<{ dirId: string; name: string; path: string; sessionCount: number }> {
  return db.prepare(`
    SELECT p.dir_id as dirId, p.name, p.path, COUNT(s.session_id) as sessionCount
    FROM projects p LEFT JOIN sessions s ON s.project_dir_id = p.dir_id
    GROUP BY p.dir_id ORDER BY p.name
  `).all() as any;
}

export function getSessionsByProject(db: Database.Database, projectDirId: string, limit = 100, offset = 0): SessionMeta[] {
  return db.prepare(`
    SELECT session_id as sessionId, project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = project_dir_id) as projectName,
           first_prompt as firstPrompt, summary, message_count as messageCount,
           subagent_count as subagentCount, created, modified,
           git_branch as gitBranch, project_path as projectPath
    FROM sessions WHERE project_dir_id = ? ORDER BY modified DESC LIMIT ? OFFSET ?
  `).all(projectDirId, limit, offset) as SessionMeta[];
}

export function getAllSessions(db: Database.Database, limit = 100, offset = 0): SessionMeta[] {
  return db.prepare(`
    SELECT session_id as sessionId, project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = project_dir_id) as projectName,
           first_prompt as firstPrompt, summary, message_count as messageCount,
           subagent_count as subagentCount, created, modified,
           git_branch as gitBranch, project_path as projectPath
    FROM sessions ORDER BY modified DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as SessionMeta[];
}

export function searchSessions(db: Database.Database, query: string, limit = 50): SessionMeta[] {
  return db.prepare(`
    SELECT s.session_id as sessionId, s.project_dir_id as projectId,
           (SELECT name FROM projects WHERE dir_id = s.project_dir_id) as projectName,
           s.first_prompt as firstPrompt, s.summary, s.message_count as messageCount,
           s.subagent_count as subagentCount, s.created, s.modified,
           s.git_branch as gitBranch, s.project_path as projectPath
    FROM sessions_fts fts JOIN sessions s ON s.session_id = fts.session_id
    WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?
  `).all(query, limit) as SessionMeta[];
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) { _db = createDb(process.env.DB_PATH || "sessions.db"); }
  return _db;
}

export async function initDb(): Promise<void> {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) throw new Error("DATA_DIR environment variable is required");
  const db = getDb();
  console.log("Importing sessions from", dataDir);
  await importFromDataDir(db, dataDir);
  const projects = getProjects(db);
  const total = projects.reduce((sum, p) => sum + p.sessionCount, 0);
  console.log(`Imported ${total} sessions across ${projects.length} projects`);
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/db.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add app/lib/db.server.ts tests/db.test.ts
git commit -m "feat: SQLite database with FTS5 search and session import"
```

---

## Task 6: Sessions Index Page

**Files:**
- Create: `app/components/session/SessionCard.tsx`
- Modify: `app/routes/_index.tsx`
- Modify: `server/app.ts`

No separate test file -- route loaders are integration-tested by existing db tests, components are presentational.

**Step 1: Add DB init to server startup**

Modify `server/app.ts` to initialize the database on first request. See full implementation in Task 7's loader -- the key addition is calling `initDb()` before serving routes.

**Step 2: Create SessionCard component and implement the full index page**

These are presentational components following the style guide: cards with edge borders, section-labels, teal badges, nav items with active states. See the full route and component implementations in the plan's design proposal above. The route uses `getProjects`, `getAllSessions`, `getSessionsByProject`, and `searchSessions` from the db module.

**Step 3: Verify with real data**

Run: `npm run dev`, visit localhost:3000
Expected: Project sidebar, session cards, search works.

**Step 4: Commit**

```bash
git add app/routes/_index.tsx app/components/session/SessionCard.tsx server/app.ts
git commit -m "feat: sessions index page with project sidebar and search"
```

---

## Task 7: Session Detail Page

**Files:**
- Create: `app/routes/sessions.$projectId.$sessionId.tsx`
- Create: `app/components/session/MessageBlock.tsx`
- Create: `app/components/session/ThinkingBlock.tsx`
- Create: `app/components/session/ToolCallBlock.tsx`

**Step 1: Implement the session detail route**

The loader reads the JSONL file, builds the conversation thread, discovers subagents, and computes token totals. The page renders a conversation thread in the main area with a metadata sidebar.

**Step 2: Implement message rendering components**

- `MessageBlock`: Renders a single message (user or assistant). Shows role label, model, timestamp. Iterates content blocks.
- `ThinkingBlock`: Collapsible `<details>` showing "Thinking..." summary, expands to full thinking text.
- `ToolCallBlock`: Collapsible `<details>` showing tool name + preview (description/command/file_path), expands to full JSON input.
- Tool results rendered as collapsible blocks with truncation for large outputs.
- Text content rendered via `react-markdown` with tightened prose spacing per style guide.

**Step 3: Verify**

Navigate to a session with tool calls and thinking blocks. Verify collapsible behavior, markdown rendering, metadata sidebar.

**Step 4: Commit**

```bash
git add app/routes/sessions.\$projectId.\$sessionId.tsx app/components/session/
git commit -m "feat: session detail page with message rendering and collapsible blocks"
```

---

## Task 8: Subagent Expansion

**Files:**
- Create: `app/components/session/SubagentPanel.tsx`
- Create: `app/routes/api.subagent.$projectId.$sessionId.$agentId.tsx`

**Step 1: Create API route for subagent data**

A resource route that parses a subagent JSONL file and returns the conversation thread as JSON.

**Step 2: Create SubagentPanel component**

Lazy-loading panel with expand/collapse toggle. On expand, fetches subagent messages from the API route and renders them using the same `MessageBlock` components. Visually distinguished with `border-l-2 border-teal-light` left border and indentation.

**Step 3: Wire into session detail**

Render SubagentPanels in the metadata sidebar, each expandable. Clicking loads the subagent's conversation inline.

**Step 4: Verify**

Navigate to a session with subagents. Expand one. Verify messages load and render correctly.

**Step 5: Commit**

```bash
git add app/components/session/SubagentPanel.tsx app/routes/api.subagent.\$projectId.\$sessionId.\$agentId.tsx
git commit -m "feat: lazy-loading subagent expansion"
```

---

## Task 9: Polish and Final Integration

**Step 1: Large session pagination**

If messages > 200, return first 200 with `hasMore` flag. Add "Load more" button.

**Step 2: Loading states**

Use React Router's `useNavigation` for pending UI. Pulsing teal dot per style guide.

**Step 3: Update .env.example with all vars**

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: polish, pagination, loading states"
```

---

## File Structure Summary

```
session-explorer/
  app/
    app.css                                  # Superpowers design system
    root.tsx                                 # HTML shell, fonts, error boundary
    components/layout/AppShell.tsx           # Header + main wrapper
    components/session/
      SessionCard.tsx                        # Session list card
      MessageBlock.tsx                       # Message rendering
      ThinkingBlock.tsx                      # Collapsible thinking
      ToolCallBlock.tsx                      # Collapsible tool calls
      SubagentPanel.tsx                      # Lazy subagent expansion
    lib/
      types.ts                              # TypeScript types
      parser.server.ts                      # JSONL parsing
      scanner.server.ts                     # Directory discovery
      db.server.ts                          # SQLite + FTS5
    routes/
      _index.tsx                            # Sessions list + search
      sessions.$projectId.$sessionId.tsx    # Session detail
      api.subagent.$projectId.$sessionId.$agentId.tsx
  server/app.ts                             # Express + DB init
  tests/
    fixtures/*.jsonl                        # Test data
    types.test.ts
    parser.test.ts
    scanner.test.ts
    db.test.ts
  docs/plans/2026-02-04-session-explorer.md
  public/favicon.svg
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts
  react-router.config.ts, server.js, env.d.ts
  .env.example, .gitignore
```
