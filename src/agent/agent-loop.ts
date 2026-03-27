import type {
  AgentMessage,
  AgentRunResult,
  AgentStepLog,
  MistralToolCall,
  TokenUsage,
} from "../types";
import { LLMClient } from "../llm/llm-client";
import { AGENT_TOOLS } from "../llm/tool-definitions";
import { SYSTEM_PROMPT_AGENT, SYSTEM_PROMPT_CHAT, promptEnrichContext } from "../llm/prompt-templates";
import { buildSectionOutline } from "../notes/markdown-builder";
import { SessionMemory } from "../memory/session-memory";
import { ToolRunner } from "./tool-runner";

type LogCallback = (log: AgentStepLog) => void;

export class AgentLoop {
  private sessionMemory: SessionMemory;
  private contextInjected = false;

  constructor(
    private client: LLMClient,
    private toolRunner: ToolRunner,
    private maxIterations: number
  ) {
    this.sessionMemory = new SessionMemory();
  }

  async run(
    instruction: string,
    noteContent: string,
    notePath: string,
    onLog?: LogCallback
  ): Promise<AgentRunResult> {
    this.sessionMemory.clear();

    const logs: AgentStepLog[] = [];
    const queriesUsed: string[] = [];
    const urlsCrawled: string[] = [];

    const log = (type: AgentStepLog["type"], message: string) => {
      const entry: AgentStepLog = { type, message, timestamp: Date.now() };
      logs.push(entry);
      onLog?.(entry);
    };

    const systemMessage: AgentMessage = {
      role: "system",
      content: SYSTEM_PROMPT_AGENT,
    };

    const userMessage: AgentMessage = {
      role: "user",
      content: promptEnrichContext(noteContent, instruction, notePath),
    };

    this.sessionMemory.addMessage(systemMessage);
    this.sessionMemory.addMessage(userMessage);

    let iterations = 0;
    let finalContent = "";
    const tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    log("think", "Agent started. Planning approach...");

    while (iterations < this.maxIterations) {
      iterations++;

      const messages = this.sessionMemory.getHistory();
      const response = await this.client.chatWithTools(messages, AGENT_TOOLS);

      if (response.usage) {
        tokenUsage.promptTokens += response.usage.prompt_tokens;
        tokenUsage.completionTokens += response.usage.completion_tokens;
        tokenUsage.totalTokens += response.usage.total_tokens;
        this.sessionMemory.recordUsage(
          response.usage.prompt_tokens,
          response.usage.completion_tokens
        );
      }

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;

      this.sessionMemory.addMessage({
        role: "assistant",
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls?.length ? assistantMessage.tool_calls : undefined,
      });

      if (choice.finish_reason === "stop" || !assistantMessage.tool_calls?.length) {
        finalContent = assistantMessage.content ?? "";
        log("think", "Agent completed reasoning.");
        break;
      }

      for (const toolCall of assistantMessage.tool_calls ?? []) {
        await this.executeToolCall(toolCall, logs, queriesUsed, urlsCrawled, log);
      }
    }

    if (iterations >= this.maxIterations && !finalContent) {
      log("think", "Iteration limit reached, generating final response...");
      try {
        const finalResp = await this.client.chatWithTools(this.sessionMemory.getHistory(), []);
        if (finalResp.usage) {
          tokenUsage.promptTokens += finalResp.usage.prompt_tokens;
          tokenUsage.completionTokens += finalResp.usage.completion_tokens;
          tokenUsage.totalTokens += finalResp.usage.total_tokens;
        }
        finalContent = finalResp.choices[0]?.message.content ?? "";
      } catch {
        finalContent = "";
      }
      if (!finalContent) {
        log("error", `Max iterations (${this.maxIterations}) reached without a response.`);
        finalContent = "The agent exhausted its iteration budget. Try rephrasing or increasing Max Agent Iterations in settings.";
      }
    }

    return { finalContent, logs, tokenUsage, queriesUsed, urlsCrawled };
  }

  private async executeToolCall(
    toolCall: MistralToolCall,
    logs: AgentStepLog[],
    queriesUsed: string[],
    urlsCrawled: string[],
    log: (type: AgentStepLog["type"], message: string) => void
  ): Promise<void> {
    const name = toolCall.function.name;
    let args: Record<string, unknown> = {};

    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      log("error", `Failed to parse arguments for tool: ${name}`);
    }

    if (name === "search_web") {
      const query = String(args.query ?? "");
      log("search", `Searching: ${query}`);
      if (query) queriesUsed.push(query);
    } else if (name === "crawl_url") {
      const url = String(args.url ?? "");
      log("crawl", `Crawling: ${url}`);
      if (url) urlsCrawled.push(url);
    } else if (name === "write_to_note" || name === "create_note") {
      log("write", `Writing to note: ${String(args.path ?? "")}`);
    } else {
      log("think", `Executing: ${name}`);
    }

    const result = await this.toolRunner.execute(name, args);

    this.sessionMemory.addMessage({
      role: "tool",
      content: result.data,
      tool_call_id: toolCall.id,
    });

    if (!result.success) {
      log("error", `Tool ${name} failed: ${result.data}`);
    }
  }

  resetSession(): void {
    this.sessionMemory.clear();
  }

  async chatTurn(
    userMessage: string,
    noteContent: string,
    notePath: string,
    onLog?: LogCallback
  ): Promise<AgentRunResult> {
    const logs: AgentStepLog[] = [];
    const queriesUsed: string[] = [];
    const urlsCrawled: string[] = [];

    const log = (type: AgentStepLog["type"], message: string) => {
      const entry: AgentStepLog = { type, message, timestamp: Date.now() };
      logs.push(entry);
      onLog?.(entry);
    };

    if (this.sessionMemory.isEmpty()) {
      this.sessionMemory.addMessage({ role: "system", content: SYSTEM_PROMPT_CHAT });
    }

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    let userContent: string;
    if (!this.contextInjected && noteContent && notePath) {
      const outline = buildSectionOutline(noteContent);
      const preview = noteContent.length > 3000
        ? noteContent.slice(0, 3000) + "\n... (truncated — use read_note for full content)"
        : noteContent;
      userContent =
        `[Current date: ${dateStr}]\n` +
        `[Active note: ${notePath}]\n` +
        `[Section outline:\n${outline}\n]\n` +
        `[Note content (first 3000 chars):\n\`\`\`markdown\n${preview}\n\`\`\`]\n\n` +
        `User: ${userMessage}`;
      this.contextInjected = true;
    } else if (notePath) {
      userContent = `[Current date: ${dateStr}]\n[Active note: ${notePath}]\n\nUser: ${userMessage}`;
    } else {
      userContent = `[Current date: ${dateStr}]\n\nUser: ${userMessage}`;
    }

    this.sessionMemory.addMessage({ role: "user", content: userContent });

    let iterations = 0;
    let finalContent = "";
    const tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    while (iterations < this.maxIterations) {
      iterations++;

      const messages = this.sessionMemory.getHistory();
      const response = await this.client.chatWithTools(messages, AGENT_TOOLS);

      if (response.usage) {
        tokenUsage.promptTokens += response.usage.prompt_tokens;
        tokenUsage.completionTokens += response.usage.completion_tokens;
        tokenUsage.totalTokens += response.usage.total_tokens;
        this.sessionMemory.recordUsage(response.usage.prompt_tokens, response.usage.completion_tokens);
      }

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      this.sessionMemory.addMessage({
        role: "assistant",
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls?.length ? assistantMessage.tool_calls : undefined,
      });

      if (choice.finish_reason === "stop" || !assistantMessage.tool_calls?.length) {
        finalContent = assistantMessage.content ?? "";
        break;
      }

      for (const toolCall of assistantMessage.tool_calls ?? []) {
        await this.executeToolCall(toolCall, logs, queriesUsed, urlsCrawled, log);
      }
    }

    if (iterations >= this.maxIterations && !finalContent) {
      try {
        const finalResp = await this.client.chatWithTools(this.sessionMemory.getHistory(), []);
        if (finalResp.usage) {
          tokenUsage.promptTokens += finalResp.usage.prompt_tokens;
          tokenUsage.completionTokens += finalResp.usage.completion_tokens;
          tokenUsage.totalTokens += finalResp.usage.total_tokens;
        }
        finalContent = finalResp.choices[0]?.message.content ?? "";
      } catch {
        finalContent = "";
      }
      if (!finalContent) {
        finalContent = "The agent exhausted its iteration budget. Try rephrasing or increasing Max Agent Iterations in settings.";
      }
    }

    return { finalContent, logs, tokenUsage, queriesUsed, urlsCrawled };
  }

  resetChat(): void {
    this.sessionMemory.clear();
    this.contextInjected = false;
  }
}
