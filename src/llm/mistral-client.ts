import type { AgentMessage, AgentTool, MistralResponse, PenNoteSettings } from "../types";

export class MistralClient {
  private apiKey: string;
  private model: string;
  private baseUrl = "https://api.mistral.ai/v1";

  constructor(settings: PenNoteSettings) {
    this.apiKey = settings.mistralApiKey;
    this.model = settings.mistralModel;
  }

  updateSettings(settings: PenNoteSettings): void {
    this.apiKey = settings.mistralApiKey;
    this.model = settings.mistralModel;
  }

  async chat(messages: AgentMessage[], model?: string): Promise<string> {
    const response = await this.post("/chat/completions", {
      model: model ?? this.model,
      messages,
    });
    const data = (await response.json()) as MistralResponse;
    return data.choices[0]?.message.content ?? "";
  }

  async chatWithTools(
    messages: AgentMessage[],
    tools: AgentTool[],
    model?: string
  ): Promise<MistralResponse> {
    const response = await this.post("/chat/completions", {
      model: model ?? this.model,
      messages,
      tools,
      tool_choice: "auto",
    });
    return response.json() as Promise<MistralResponse>;
  }

  async testConnection(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: this.buildHeaders(),
    });
    if (response.status === 401) {
      throw new Error("Invalid API key");
    }
    if (!response.ok) {
      throw new Error(`Mistral API error: HTTP ${response.status}`);
    }
  }

  private async post(path: string, body: unknown): Promise<Response> {
    let lastError: Error = new Error("Request failed");

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await this.delay(Math.pow(2, attempt) * 1000);
      }
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
        });

        if (response.status === 401) {
          throw new Error("Invalid Mistral API key. Check your settings.");
        }
        if (response.status === 429) {
          if (attempt < 2) continue;
          throw new Error("Mistral rate limit exceeded. Try again shortly.");
        }
        if (!response.ok) {
          throw new Error(`Mistral API error: HTTP ${response.status}`);
        }
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.startsWith("Invalid Mistral") || !this.isRetryable(lastError)) {
          throw lastError;
        }
      }
    }
    throw lastError;
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private isRetryable(err: Error): boolean {
    return (
      err.message.includes("rate limit") ||
      err.message.includes("502") ||
      err.message.includes("503") ||
      err.message.includes("504") ||
      err.message.includes("network")
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
