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
  user: string;
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
