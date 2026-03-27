import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import type { AgentStepLog, ChatMessage, TokenUsage } from "../types";

export const VIEW_TYPE_PENNOTE = "pennote-ai-panel";

type SendHandler = (text: string, mode: string) => Promise<void>;

const STEP_TYPE_ICON: Record<string, string> = {
  search: "○",
  crawl:  "○",
  think:  "○",
  write:  "○",
  error:  "✕",
  plan:   "○",
};

export class PanelView extends ItemView {
  private chatContainer!: HTMLElement;
  private chatInput!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private modeSelect!: HTMLSelectElement;
  private statusEl!: HTMLElement;
  private tokenEl!: HTMLElement;
  private fileInputEl!: HTMLInputElement;
  private attachBadge!: HTMLElement;

  private planTrackerEl: HTMLElement | null = null;
  private planStepListEl: HTMLElement | null = null;
  private planCurrentStepEl: HTMLElement | null = null;

  private attachedFileContent: string | null = null;
  private attachedFileName: string | null = null;

  constructor(leaf: WorkspaceLeaf, private onSendMessage: SendHandler) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_PENNOTE; }
  getDisplayText(): string { return "PenNote AI"; }
  getIcon(): string { return "shield"; }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pennote-panel");

    const header = contentEl.createDiv({ cls: "pennote-panel-header" });
    header.createSpan({ cls: "pennote-header-title", text: "◈ PenNote AI" });
    const clearBtn = header.createEl("button", { cls: "pennote-header-btn", text: "Clear" });
    clearBtn.addEventListener("click", () => this.clearChat());

    const controls = contentEl.createDiv({ cls: "pennote-chat-controls" });
    this.modeSelect = controls.createEl("select", { cls: "pennote-mode-compact" }) as HTMLSelectElement;
    const modes = [
      { value: "chat",          label: "› Chat" },
      { value: "enrich",        label: "+ Enrich note" },
      { value: "gap-analysis",  label: "◎ Gap analysis" },
      { value: "add-command",   label: "$ Add command" },
      { value: "search-update", label: "↻ Search update" },
    ];
    for (const m of modes) {
      const opt = this.modeSelect.createEl("option", { text: m.label });
      opt.value = m.value;
    }

    this.chatContainer = contentEl.createDiv({ cls: "pennote-chat-messages" });

    this.attachBadge = contentEl.createDiv({ cls: "pennote-attach-badge" });
    this.attachBadge.style.display = "none";

    const inputRow = contentEl.createDiv({ cls: "pennote-chat-input-row" });

    this.fileInputEl = document.createElement("input");
    this.fileInputEl.type = "file";
    this.fileInputEl.accept = ".txt,.md,.log,.csv,.json,.xml,.html,.pdf";
    this.fileInputEl.style.display = "none";
    inputRow.appendChild(this.fileInputEl);
    this.fileInputEl.addEventListener("change", () => void this.handleFileAttach());

    const attachBtn = inputRow.createEl("button", { cls: "pennote-attach-btn", text: "+" });
    attachBtn.title = "Attach a text file or PDF";
    attachBtn.addEventListener("click", () => { this.fileInputEl.value = ""; this.fileInputEl.click(); });

    this.chatInput = inputRow.createEl("textarea", { cls: "pennote-chat-textarea" }) as HTMLTextAreaElement;
    this.chatInput.placeholder = "Ask anything or give an instruction…";
    this.chatInput.rows = 1;
    this.chatInput.addEventListener("input", () => this.autoResize());
    this.chatInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void this.handleSend(); }
    });

    this.sendBtn = inputRow.createEl("button", { cls: "pennote-send-btn", text: "Send" });
    this.sendBtn.addEventListener("click", () => void this.handleSend());

    const footer = contentEl.createDiv({ cls: "pennote-footer" });
    this.statusEl = footer.createSpan({ cls: "pennote-status-text", text: "Ready" });
    this.tokenEl = footer.createSpan({ cls: "pennote-token-usage" });
  }

  async onClose(): Promise<void> {}


  appendChatMessage(msg: ChatMessage): void {
    if (msg.role === "assistant") {
      this.chatContainer.querySelector(".pennote-chat-bubble.loading")?.remove();
    }
    const bubble = this.chatContainer.createDiv({
      cls: `pennote-chat-bubble ${msg.role}${msg.isLoading ? " loading" : ""}`,
    });
    if (msg.role === "assistant") {
      MarkdownRenderer.render(this.app, msg.text, bubble, "", this);
    } else {
      bubble.setText(msg.text);
    }
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  appendErrorWithRetry(message: string, onRetry: () => void): void {
    this.chatContainer.querySelector(".pennote-chat-bubble.loading")?.remove();
    const bubble = this.chatContainer.createDiv({ cls: "pennote-chat-bubble assistant pennote-error-bubble" });
    bubble.createSpan({ cls: "pennote-error-text", text: message });
    const btn = bubble.createEl("button", { cls: "pennote-retry-btn", text: "↻ Retry" });
    btn.addEventListener("click", () => {
      bubble.remove();
      onRetry();
    });
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  appendDiffSummary(added: number, removed: number, filename: string): void {
    const bubble = this.chatContainer.createDiv({ cls: "pennote-chat-bubble pennote-diff-bubble" });
    bubble.createSpan({ cls: "pennote-diff-label", text: "Note updated" });
    if (added > 0) bubble.createSpan({ cls: "pennote-diff-added", text: `+${added}` });
    if (removed > 0) bubble.createSpan({ cls: "pennote-diff-removed", text: `-${removed}` });
    bubble.createSpan({ cls: "pennote-diff-file", text: filename });
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  startPlanTracker(): void {
    this.chatContainer.querySelector(".pennote-chat-bubble.loading")?.remove();
    this.planTrackerEl?.remove();
    this.planCurrentStepEl = null;

    this.planTrackerEl = this.chatContainer.createDiv({ cls: "pennote-plan-tracker" });
    const hd = this.planTrackerEl.createDiv({ cls: "pennote-plan-header" });
    hd.createSpan({ cls: "pennote-plan-pulse" });
    hd.createSpan({ text: "Working…" });
    this.planStepListEl = this.planTrackerEl.createDiv({ cls: "pennote-plan-steps" });
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  pushPlanStep(log: AgentStepLog): void {
    if (!this.planTrackerEl || !this.planStepListEl) return;

    if (this.planCurrentStepEl) {
      this.planCurrentStepEl.removeClass("current");
      this.planCurrentStepEl.addClass("done");
      const icon = this.planCurrentStepEl.querySelector(".pennote-step-icon");
      if (icon && icon.textContent !== "✕") icon.textContent = "✓";
    }

    const step = this.planStepListEl.createDiv({ cls: `pennote-plan-step current step-${log.type}` });
    step.createSpan({ cls: "pennote-step-icon", text: STEP_TYPE_ICON[log.type] ?? "○" });
    step.createSpan({ cls: "pennote-step-text", text: log.message });
    this.planCurrentStepEl = step;
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  finishPlanTracker(): void {
    if (!this.planTrackerEl) return;

    if (this.planCurrentStepEl) {
      this.planCurrentStepEl.removeClass("current");
      this.planCurrentStepEl.addClass("done");
      const icon = this.planCurrentStepEl.querySelector(".pennote-step-icon");
      if (icon && icon.textContent !== "✕") icon.textContent = "✓";
    }

    const hd = this.planTrackerEl.querySelector<HTMLElement>(".pennote-plan-header");
    if (hd) {
      hd.empty();
      hd.createEl("span", { cls: "pennote-plan-done-icon", text: "✓" });
      hd.createEl("span", { text: " Done" });
    }

    this.planTrackerEl = null;
    this.planStepListEl = null;
    this.planCurrentStepEl = null;
  }

  appendLog(log: AgentStepLog): void {
    if (this.planTrackerEl) this.pushPlanStep(log);
  }

  showThinking(): void {
    if (!this.planTrackerEl) {
      this.chatContainer.querySelector(".pennote-chat-bubble.loading")?.remove();
      this.chatContainer.createDiv({ cls: "pennote-chat-bubble assistant loading" }).setText("Thinking…");
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
  }

  setStatus(text: string): void { this.statusEl.setText(text); }

  setTokenUsage(usage: TokenUsage): void {
    this.tokenEl.setText(
      `${usage.totalTokens.toLocaleString()} tokens ` +
      `(↑${usage.promptTokens.toLocaleString()} ↓${usage.completionTokens.toLocaleString()})`
    );
  }

  setInputEnabled(enabled: boolean): void {
    this.chatInput.disabled = !enabled;
    this.sendBtn.disabled = !enabled;
    this.statusEl.setText(enabled ? "Ready" : "Running…");
  }

  clearLog(): void {
  }

  clearChat(): void {
    this.chatContainer.empty();
    this.tokenEl.setText("");
    this.statusEl.setText("Ready");
    this.clearAttachment();
    this.planTrackerEl = null;
    this.planStepListEl = null;
    this.planCurrentStepEl = null;
  }

  private async handleSend(): Promise<void> {
    const rawText = this.chatInput.value.trim();
    if (!rawText || this.sendBtn.disabled) return;

    let fullText = rawText;
    if (this.attachedFileContent && this.attachedFileName) {
      fullText += this.buildAttachedContent(this.attachedFileContent, this.attachedFileName);
    }

    this.appendChatMessage({ role: "user", text: rawText, timestamp: Date.now() });
    this.chatInput.value = "";
    this.autoResize();
    this.clearAttachment();
    this.setInputEnabled(false);

    const mode = this.modeSelect.value;
    try {
      await this.onSendMessage(fullText, mode);
    } catch (err) {
      this.appendChatMessage({
        role: "assistant",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    } finally {
      this.setInputEnabled(true);
      this.chatInput.focus();
    }
  }

  private async handleFileAttach(): Promise<void> {
    const file = this.fileInputEl.files?.[0];
    if (!file) return;
    this.attachedFileName = file.name;

    try {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        this.attachedFileContent = await this.extractPdfText(file);
      } else {
        this.attachedFileContent = await file.text();
      }
      this.showAttachBadge(file.name, this.attachedFileContent.length);
    } catch {
      this.attachedFileContent = null;
      this.showAttachError("Could not read file. Try a plain text format.");
    }
  }

  private async extractPdfText(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let raw = "";
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    const parts: string[] = [];
    const btRe = /BT([\s\S]*?)ET/g;
    let bt: RegExpExecArray | null;
    while ((bt = btRe.exec(raw)) !== null) {
      const block = bt[1];
      const litRe = /\(([^)]*)\)\s*(?:Tj|TJ|'|")/g;
      let m: RegExpExecArray | null;
      while ((m = litRe.exec(block)) !== null) {
        const t = m[1]
          .replace(/\\(\d{3})/g, (_c, n) => String.fromCharCode(parseInt(n, 8)))
          .replace(/\\n/g, " ").replace(/\\r/g, " ");
        if (t.trim()) parts.push(t);
      }
      const hexRe = /<([0-9a-fA-F]+)>\s*(?:Tj|TJ)/g;
      while ((m = hexRe.exec(block)) !== null) {
        const hex = m[1];
        let text = "";
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.slice(i, i + 2), 16);
          if (code > 31) text += String.fromCharCode(code);
        }
        if (text.trim()) parts.push(text);
      }
    }
    return parts.join(" ").replace(/\s+/g, " ").trim() || "[No readable text found in PDF]";
  }

  private buildAttachedContent(content: string, fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const lang = ext === "md" ? "markdown" : ext;
    const CHUNK = 6000;
    if (content.length <= CHUNK) {
      return `\n\n[Attached: ${fileName}]\n\`\`\`${lang}\n${content}\n\`\`\``;
    }
    const parts: string[] = [];
    for (let i = 0; i < content.length && parts.length < 4; i += CHUNK) {
      parts.push(content.slice(i, i + CHUNK));
    }
    const total = parts.length;
    return parts.map((chunk, idx) =>
      `\n\n[Attached: ${fileName} — Part ${idx + 1}/${total}]\n\`\`\`${lang}\n${chunk}\n\`\`\``
    ).join("");
  }

  private showAttachBadge(name: string, chars: number): void {
    this.attachBadge.empty();
    this.attachBadge.style.display = "flex";
    this.attachBadge.createSpan({ cls: "pennote-attach-icon", text: "⊡" });
    this.attachBadge.createSpan({ cls: "pennote-attach-name", text: `${name}  (${chars.toLocaleString()} chars)` });
    const rm = this.attachBadge.createEl("button", { cls: "pennote-attach-remove", text: "×" });
    rm.addEventListener("click", () => this.clearAttachment());
  }

  private showAttachError(msg: string): void {
    this.attachBadge.empty();
    this.attachBadge.style.display = "flex";
    this.attachBadge.createSpan({ cls: "pennote-attach-error", text: msg });
    const rm = this.attachBadge.createEl("button", { cls: "pennote-attach-remove", text: "×" });
    rm.addEventListener("click", () => this.clearAttachment());
  }

  private clearAttachment(): void {
    this.attachedFileContent = null;
    this.attachedFileName = null;
    this.attachBadge.style.display = "none";
    this.attachBadge.empty();
    this.fileInputEl.value = "";
  }

  private autoResize(): void {
    this.chatInput.style.height = "auto";
    this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + "px";
  }
}
