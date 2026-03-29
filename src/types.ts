export type LLMProvider = "mistral" | "openai" | "xai" | "gemini" | "anthropic" | "openrouter" | "groq";

export type SearchProvider = "duckduckgo" | "tavily";

export interface PenNoteSettings {
  provider: LLMProvider;
  mistralApiKey: string;
  mistralModel: string;
  openaiApiKey: string;
  openaiModel: string;
  xaiApiKey: string;
  xaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  groqApiKey: string;
  groqModel: string;
  searchProvider: SearchProvider;
  tavilyApiKey: string;
  searchResultLimit: number;
  crawlTimeoutMs: number;
  maxAgentIterations: number;
  autoConfirmThreshold: "always" | "never" | "small-changes";
  methodologyRootFolder: string;
  methodologyTag: string;
  enableScheduledRefresh: boolean;
  refreshIntervalDays: number;
  playwrightEnabled: boolean;
  contextWindowTokenBudget: number;
  debugMode: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface CrawlResult {
  url: string;
  title: string;
  content: string;
  codeBlocks: string[];
  timestamp: number;
}

export interface MistralToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: MistralToolCall[];
}

export interface MistralResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: MistralToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AgentToolFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

export interface AgentTool {
  type: "function";
  function: AgentToolFunction;
}

export interface BrowserProfile {
  platform: string;
  vendor: string;
  languages: string[];
  viewport: { width: number; height: number };
}

export interface NoteIndexEntry {
  path: string;
  title: string;
  tags: string[];
  headings: string[];
  linkedPaths: string[];
  lastModified: number;
}

export interface EnrichmentRecord {
  noteId: string;
  timestamp: number;
  queriesUsed: string[];
  urlsCrawled: string[];
  summary: string;
}

export interface DiffHunk {
  type: "added" | "removed" | "unchanged";
  value: string;
}

export type AgentMode =
  | "enrich"
  | "gap-analysis"
  | "add-command"
  | "search-update"
  | "checklist";

export interface ActionPlan {
  mode: AgentMode;
  steps: string[];
  estimatedSearches: number;
}

export interface MethodologyTemplate {
  id: string;
  name: string;
  tags: string[];
  sections: string[];
  defaultChecklist: string[];
}

export interface ContextStoreData {
  enrichmentHistory: Record<string, EnrichmentRecord[]>;
  crawlCache: Record<string, { content: string; timestamp: number }>;
}

export interface AgentStepLog {
  type: "search" | "crawl" | "think" | "write" | "error";
  message: string;
  timestamp: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentRunResult {
  finalContent: string;
  logs: AgentStepLog[];
  tokenUsage: TokenUsage;
  queriesUsed: string[];
  urlsCrawled: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isLoading?: boolean;
}
