import type { AgentMessage } from "../types";
import { LLMClient } from "./llm-client";
import { buildQueryBuilderPrompt } from "./prompt-templates";

export class QueryBuilder {
  constructor(private client: LLMClient) {}

  async build(noteTopic: string, instruction: string): Promise<string[]> {
    const messages: AgentMessage[] = [
      {
        role: "system",
        content: buildQueryBuilderPrompt(),
      },
      {
        role: "user",
        content: `Note topic: ${noteTopic}\nUser instruction: ${instruction}\n\nGenerate the search queries now.`,
      },
    ];

    const raw = await this.client.chat(messages, "mistral-small-latest");
    return this.parseQueries(raw);
  }

  async buildFromContent(noteContent: string, instruction: string): Promise<string[]> {
    const topic = this.extractTopic(noteContent);
    return this.build(topic, instruction);
  }

  private parseQueries(raw: string): string[] {
    const trimmed = raw.trim();
    const jsonStart = trimmed.indexOf("[");
    const jsonEnd = trimmed.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) {
      return this.fallbackExtract(trimmed);
    }
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
      if (Array.isArray(parsed)) {
        return parsed.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
      }
    } catch {
      return this.fallbackExtract(trimmed);
    }
    return this.fallbackExtract(trimmed);
  }

  private fallbackExtract(raw: string): string[] {
    return raw
      .split("\n")
      .map((l) => l.replace(/^[\d\-\.\*\s"']+/, "").replace(/["',]+$/, "").trim())
      .filter((l) => l.length > 5);
  }

  private extractTopic(noteContent: string): string {
    const lines = noteContent.split("\n");
    for (const line of lines) {
      const match = line.match(/^#{1,3}\s+(.+)/);
      if (match) return match[1].trim();
    }
    const words = noteContent.split(/\s+/).slice(0, 20).join(" ");
    return words.length > 0 ? words : "penetration testing methodology";
  }
}
