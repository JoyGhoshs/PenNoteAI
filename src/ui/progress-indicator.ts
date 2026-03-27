import { Plugin } from "obsidian";

export class ProgressIndicator {
  private statusBarItem: HTMLElement;
  private spinnerTimer: number | null = null;
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;

  constructor(plugin: Plugin) {
    this.statusBarItem = plugin.addStatusBarItem();
    this.statusBarItem.addClass("pennote-status-bar");
    this.statusBarItem.style.display = "none";
  }

  setState(state: "searching" | "crawling" | "thinking" | "writing" | "idle"): void {
    this.stopSpinner();

    if (state === "idle") {
      this.statusBarItem.style.display = "none";
      return;
    }

    const labels: Record<string, string> = {
      searching: "PenNote: Searching",
      crawling: "PenNote: Crawling",
      thinking: "PenNote: Thinking",
      writing: "PenNote: Writing",
    };

    this.statusBarItem.style.display = "";
    this.startSpinner(labels[state] ?? "PenNote: Working");
  }

  private startSpinner(label: string): void {
    this.frameIndex = 0;
    this.spinnerTimer = window.setInterval(() => {
      this.statusBarItem.setText(`${this.frames[this.frameIndex % this.frames.length]} ${label}`);
      this.frameIndex++;
    }, 100);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer !== null) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  destroy(): void {
    this.stopSpinner();
    this.statusBarItem.remove();
  }
}
