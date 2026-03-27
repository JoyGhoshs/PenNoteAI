import type {
  AgentMessage,
  AgentTool,
  LLMProvider,
  MistralResponse,
  MistralToolCall,
  PenNoteSettings,
} from "../types";

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

const OPENAI_COMPAT_BASE_URLS: Record<LLMProvider, string> = {
  mistral: "https://api.mistral.ai/v1",
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  anthropic: "",
};

export class LLMClient {
  constructor(private settings: PenNoteSettings) {}

  updateSettings(s: PenNoteSettings): void {
    this.settings = s;
  }

  async chat(messages: AgentMessage[], overrideModel?: string): Promise<string> {
    const r = await this.chatWithTools(messages, [], overrideModel);
    return r.choices[0]?.message.content ?? "";
  }

  async chatWithTools(
    messages: AgentMessage[],
    tools: AgentTool[],
    overrideModel?: string
  ): Promise<MistralResponse> {
    if (this.settings.provider === "anthropic") {
      return this.callAnthropic(messages, tools);
    }
    return this.callOpenAICompat(messages, tools, overrideModel);
  }

  private getProviderKey(): string {
    switch (this.settings.provider) {
      case "openai": return this.settings.openaiApiKey;
      case "xai": return this.settings.xaiApiKey;
      case "gemini": return this.settings.geminiApiKey;
      case "openrouter": return this.settings.openrouterApiKey;
      case "groq": return this.settings.groqApiKey;
      default: return this.settings.mistralApiKey;
    }
  }

  private getProviderModel(): string {
    switch (this.settings.provider) {
      case "openai": return this.settings.openaiModel;
      case "xai": return this.settings.xaiModel;
      case "gemini": return this.settings.geminiModel;
      case "openrouter": return this.settings.openrouterModel;
      case "groq": return this.settings.groqModel;
      default: return this.settings.mistralModel;
    }
  }

  private sanitizeMessages(messages: AgentMessage[]): Record<string, unknown>[] {
    return messages.map((m) => {
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content ?? null,
      };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.tool_calls?.length) msg.tool_calls = m.tool_calls;
      return msg;
    });
  }

  private async callOpenAICompat(
    messages: AgentMessage[],
    tools: AgentTool[],
    overrideModel?: string
  ): Promise<MistralResponse> {
    const provider = this.settings.provider;
    const baseUrl = OPENAI_COMPAT_BASE_URLS[provider];
    const apiKey = this.getProviderKey();
    const model = (provider === "mistral" && overrideModel) ? overrideModel : this.getProviderModel();

    const sanitized = this.sanitizeMessages(messages);
    const body: Record<string, unknown> = { model, messages: sanitized };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    let lastError = new Error("Request failed");
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await this.delay(Math.pow(2, attempt) * 1000);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        };
        if (provider === "openrouter") {
          headers["HTTP-Referer"] = "https://github.com/pennote-ai";
          headers["X-Title"] = "PenNote AI";
        }
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (res.status === 401) throw new Error(`Invalid API key for ${provider}.`);
        if (res.status === 429) {
          if (attempt < maxAttempts - 1) {
            const retryAfter = res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset-requests");
            const waitMs = retryAfter ? this.parseRetryAfter(retryAfter) : Math.pow(2, attempt + 1) * 2000;
            lastError = new Error(`Rate limit exceeded for ${provider}. Retrying in ${Math.round(waitMs / 1000)}s...`);
            await this.delay(waitMs);
            continue;
          }
          throw new Error(`Rate limit exceeded for ${provider}. Please wait before retrying.`);
        }
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(`${provider} API error: HTTP ${res.status} — ${errBody.slice(0, 300)}`);
        }
        return res.json() as Promise<MistralResponse>;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes("Invalid API key") || !this.isRetryable(lastError)) {
          throw lastError;
        }
      }
    }
    throw lastError;
  }

  private async callAnthropic(
    messages: AgentMessage[],
    tools: AgentTool[]
  ): Promise<MistralResponse> {
    const apiKey = this.settings.anthropicApiKey;
    const model = this.settings.anthropicModel;

    let system = "";
    const nonSystem = messages.filter((m) => {
      if (m.role === "system") { system = m.content ?? ""; return false; }
      return true;
    });

    const anthropicMessages = this.convertMessagesToAnthropic(nonSystem);
    const anthropicTools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      messages: anthropicMessages,
      ...(system ? { system } : {}),
      ...(anthropicTools.length > 0 ? { tools: anthropicTools, tool_choice: { type: "auto" } } : {}),
    };

    let lastError = new Error("Request failed");
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await this.delay(Math.pow(2, attempt) * 1000);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (res.status === 401) throw new Error("Invalid Anthropic API key.");
        if (res.status === 429) {
          if (attempt < maxAttempts - 1) {
            const retryAfter = res.headers.get("retry-after") ?? res.headers.get("anthropic-ratelimit-requests-reset");
            const waitMs = retryAfter ? this.parseRetryAfter(retryAfter) : Math.pow(2, attempt + 1) * 2000;
            lastError = new Error(`Anthropic rate limit exceeded. Retrying in ${Math.round(waitMs / 1000)}s...`);
            await this.delay(waitMs);
            continue;
          }
          throw new Error("Anthropic rate limit exceeded. Please wait before retrying.");
        }
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(`Anthropic API error: HTTP ${res.status} — ${errBody.slice(0, 300)}`);
        }
        const data = (await res.json()) as AnthropicResponse;
        return this.normalizeAnthropicResponse(data);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (
          lastError.message.includes("Invalid Anthropic") ||
          !this.isRetryable(lastError)
        ) {
          throw lastError;
        }
      }
    }
    throw lastError;
  }

  private convertMessagesToAnthropic(messages: AgentMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];

      if (m.role === "tool") {
        const toolResults: AnthropicContentBlock[] = [];
        while (i < messages.length && messages[i].role === "tool") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: messages[i].tool_call_id ?? "",
            content: messages[i].content ?? "",
          });
          i++;
        }
        i--;
        result.push({ role: "user", content: toolResults });
        continue;
      }

      if (m.role === "assistant" && m.tool_calls?.length) {
        const blocks: AnthropicContentBlock[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls) {
          let parsedInput: Record<string, unknown> = {};
          try { parsedInput = JSON.parse(tc.function.arguments || "{}"); } catch { }
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: parsedInput,
          });
        }
        result.push({ role: "assistant", content: blocks });
        continue;
      }

      result.push({ role: m.role as "user" | "assistant", content: m.content ?? "" });
    }

    return result;
  }

  private normalizeAnthropicResponse(data: AnthropicResponse): MistralResponse {
    let textContent: string | null = null;
    const toolCalls: MistralToolCall[] = [];

    for (const block of data.content) {
      if (block.type === "text" && block.text) {
        textContent = (textContent ?? "") + block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id ?? "",
          type: "function",
          function: {
            name: block.name ?? "",
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      }
    }

    const finishReason = data.stop_reason === "tool_use" ? "tool_calls" : "stop";

    return {
      id: data.id,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: textContent,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  }

  async testConnection(): Promise<void> {
    const provider = this.settings.provider;
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": this.settings.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (res.status === 401) throw new Error("Invalid API key.");
      if (!res.ok) throw new Error(`Anthropic API error: HTTP ${res.status}`);
      return;
    }
    const baseUrl = OPENAI_COMPAT_BASE_URLS[provider];
    const apiKey = this.getProviderKey();
    let modelsUrl = `${baseUrl}/models`;
    if (provider === "openrouter") modelsUrl = "https://openrouter.ai/api/v1/models";
    const res = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) throw new Error("Invalid API key.");
    if (!res.ok) throw new Error(`${provider} API error: HTTP ${res.status}`);
  }

  private isRetryable(err: Error): boolean {
    return (
      err.message.includes("rate limit") ||
      err.message.includes("Retrying in") ||
      err.message.includes("502") ||
      err.message.includes("503") ||
      err.message.includes("504") ||
      err.message.includes("network")
    );
  }

  private parseRetryAfter(value: string): number {
    const seconds = Number(value);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 60000);
    }
    const date = Date.parse(value);
    if (!isNaN(date)) {
      return Math.min(Math.max(date - Date.now(), 1000), 60000);
    }
    return 8000;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
