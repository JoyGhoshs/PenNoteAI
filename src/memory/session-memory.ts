import type { AgentMessage } from "../types";

const MAX_TURNS = 20;

export class SessionMemory {
  private turns: AgentMessage[] = [];
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;

  addMessage(message: AgentMessage): void {
    this.turns.push(message);
    if (this.turns.length > MAX_TURNS * 2) {
      this.turns = this.turns.slice(-MAX_TURNS * 2);
    }
  }

  getHistory(): AgentMessage[] {
    return [...this.turns];
  }

  recordUsage(promptTokens: number, completionTokens: number): void {
    this.totalPromptTokens += promptTokens;
    this.totalCompletionTokens += completionTokens;
  }

  getTotalTokens(): { prompt: number; completion: number; total: number } {
    return {
      prompt: this.totalPromptTokens,
      completion: this.totalCompletionTokens,
      total: this.totalPromptTokens + this.totalCompletionTokens,
    };
  }

  clear(): void {
    this.turns = [];
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
  }

  size(): number {
    return this.turns.length;
  }

  isEmpty(): boolean {
    return this.turns.length === 0;
  }
}
