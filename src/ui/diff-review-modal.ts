import { App, Modal } from "obsidian";
import type { DiffHunk } from "../types";
import { countChanges } from "../notes/diff-patcher";

export class DiffReviewModal extends Modal {
  private hunks: DiffHunk[];
  private onAccept: () => void;
  private onReject: () => void;

  constructor(
    app: App,
    hunks: DiffHunk[],
    onAccept: () => void,
    onReject: () => void
  ) {
    super(app);
    this.hunks = hunks;
    this.onAccept = onAccept;
    this.onReject = onReject;
    this.modalEl.addClass("pennote-diff-modal");
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Review Proposed Changes" });

    const counts = countChanges(this.hunks);
    const summaryEl = contentEl.createDiv({ cls: "pennote-diff-summary" });
    summaryEl.setText(
      `${counts.added} lines added, ${counts.removed} lines removed`
    );

    const diffContainer = contentEl.createDiv({ cls: "pennote-diff-container" });

    for (const hunk of this.hunks) {
      const lines = hunk.value.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === lines.length - 1 && line === "") continue;

        const lineEl = diffContainer.createDiv({ cls: `pennote-diff-line ${hunk.type}` });
        const prefix = hunk.type === "added" ? "+ " : hunk.type === "removed" ? "- " : "  ";
        lineEl.setText(prefix + line);
      }
    }

    const actions = contentEl.createDiv({ cls: "pennote-diff-actions" });

    const rejectBtn = actions.createEl("button", { text: "Reject" });
    rejectBtn.addEventListener("click", () => {
      this.close();
      this.onReject();
    });

    const acceptBtn = actions.createEl("button", { text: "Accept Changes" });
    acceptBtn.style.fontWeight = "600";
    acceptBtn.addEventListener("click", () => {
      this.close();
      this.onAccept();
    });

    this.scope.register(["Ctrl"], "Enter", () => {
      acceptBtn.click();
      return false;
    });

    this.scope.register([], "Escape", () => {
      rejectBtn.click();
      return false;
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
