import type { ActionPlan, AgentMessage, AgentMode } from "../types";
import { LLMClient } from "../llm/llm-client";
import { SYSTEM_PROMPT_PLANNER } from "../llm/prompt-templates";

export class ActionPlanner {
  constructor(private client: LLMClient) {}

  async plan(instruction: string, noteContent: string): Promise<ActionPlan> {
    const messages: AgentMessage[] = [
      { role: "system", content: SYSTEM_PROMPT_PLANNER },
      {
        role: "user",
        content: `User instruction: ${instruction}\n\nNote content (first 500 chars):\n${noteContent.slice(0, 500)}`,
      },
    ];

    const raw = await this.client.chat(messages, "mistral-small-latest");
    return this.parsePlan(raw, instruction);
  }

  private parsePlan(raw: string, instruction: string): ActionPlan {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        if (this.isValidPlan(parsed)) {
          return parsed as ActionPlan;
        }
      } catch {
      }
    }
    return this.defaultPlan(instruction);
  }

  private isValidPlan(obj: unknown): obj is ActionPlan {
    if (typeof obj !== "object" || obj === null) return false;
    const o = obj as Record<string, unknown>;
    return (
      typeof o.mode === "string" &&
      Array.isArray(o.steps) &&
      typeof o.estimatedSearches === "number"
    );
  }

  private defaultPlan(instruction: string): ActionPlan {
    const lower = instruction.toLowerCase();
    let mode: AgentMode = "enrich";

    if (lower.includes("gap") || lower.includes("missing")) mode = "gap-analysis";
    else if (lower.includes("checklist") || lower.includes("checkbox")) mode = "checklist";
    else if (lower.includes("command") || lower.includes("tool") || lower.includes("syntax")) mode = "add-command";
    else if (lower.includes("update") || lower.includes("refresh")) mode = "search-update";

    return {
      mode,
      steps: ["Search for relevant information", "Crawl top results", "Write enriched content"],
      estimatedSearches: 3,
    };
  }
}
