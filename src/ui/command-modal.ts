import { App, Modal } from "obsidian";
import type { AgentMode } from "../types";

export interface CommandModalResult {
  instruction: string;
  mode: AgentMode;
}

export class CommandModal extends Modal {
  private result: CommandModalResult | null = null;
  private onSubmit: (result: CommandModalResult) => void;
  private initialContext: string;

  constructor(app: App, initialContext: string, onSubmit: (result: CommandModalResult) => void) {
    super(app);
    this.initialContext = initialContext;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "PenNote AI" });

    const container = contentEl.createDiv({ cls: "pennote-modal-content" });

    const modeLabel = container.createEl("label", { text: "Mode" });
    const modeSelect = container.createEl("select", { cls: "pennote-mode-select" }) as HTMLSelectElement;
    modeLabel.htmlFor = "pennote-mode";
    modeSelect.id = "pennote-mode";

    const modeOptions: Array<{ value: AgentMode; label: string }> = [
      { value: "enrich", label: "Enrich — add new techniques and updated information" },
      { value: "gap-analysis", label: "Gap Analysis — find and fill missing sections" },
      { value: "add-command", label: "Add Command — research and add tool commands" },
      { value: "search-update", label: "Search Update — refresh info from the web" },
      { value: "checklist", label: "Convert to Checklist — reformat selected text" },
    ];

    for (const opt of modeOptions) {
      const el = modeSelect.createEl("option", { text: opt.label });
      el.value = opt.value;
    }

    const instrLabel = container.createEl("label", { text: "Instruction" });
    const instrInput = container.createEl("textarea", {
      cls: "pennote-instruction-input",
    }) as HTMLTextAreaElement;
    instrLabel.htmlFor = "pennote-instruction";
    instrInput.id = "pennote-instruction";
    instrInput.placeholder =
      "Describe what you want to add, update, or improve in this note...";

    if (this.initialContext) {
      const contextEl = container.createDiv();
      contextEl.createEl("label", { text: "Context (active note)" });
      const ctx = contextEl.createEl("div");
      ctx.style.fontSize = "11px";
      ctx.style.color = "var(--text-muted)";
      ctx.style.maxHeight = "60px";
      ctx.style.overflow = "hidden";
      ctx.style.fontFamily = "var(--font-monospace)";
      ctx.setText(this.initialContext.slice(0, 200) + (this.initialContext.length > 200 ? "..." : ""));
    }

    const btnRow = container.createDiv({ cls: "pennote-diff-actions" });

    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const runBtn = btnRow.createEl("button", { text: "Run Agent" });
    runBtn.style.fontWeight = "600";
    runBtn.addEventListener("click", () => {
      const instruction = instrInput.value.trim();
      if (!instruction) {
        instrInput.style.border = "1px solid var(--color-red)";
        return;
      }
      this.result = {
        instruction,
        mode: modeSelect.value as AgentMode,
      };
      this.close();
      this.onSubmit(this.result);
    });

    instrInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        runBtn.click();
      }
    });

    setTimeout(() => instrInput.focus(), 50);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
