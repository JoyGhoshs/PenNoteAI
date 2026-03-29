import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, PenNoteSettingTab } from "./settings";
import type { AgentStepLog, ChatMessage, ContextStoreData, DiffHunk, PenNoteSettings } from "./types";
import { LLMClient } from "./llm/llm-client";
import { QueryBuilder } from "./llm/query-builder";
import { DuckDuckGoSearcher } from "./search/duckduckgo";
import { TavilySearcher } from "./search/tavily";
import { Crawler } from "./search/crawler";
import { ContextStore } from "./memory/context-store";
import { NoteIndexer } from "./memory/note-indexer";
import { AgentLoop } from "./agent/agent-loop";
import { ToolRunner } from "./agent/tool-runner";
import { ActionPlanner } from "./agent/action-planner";
import { computeDiff, applyPatch, isSmallChange } from "./notes/diff-patcher";
import { TemplateRegistry } from "./notes/template-registry";
import { updateFrontmatter, buildReferencesSection } from "./notes/markdown-builder";
import { convertToChecklist } from "./notes/checklist-engine";
import { PanelView, VIEW_TYPE_PENNOTE } from "./ui/panel-view";
import { ProgressIndicator } from "./ui/progress-indicator";
import { CommandModal } from "./ui/command-modal";
import { DiffReviewModal } from "./ui/diff-review-modal";

const STORE_KEY = "pennote-context-store";

export default class PenNotePlugin extends Plugin {
  settings!: PenNoteSettings;

  private llmClient!: LLMClient;
  private queryBuilder!: QueryBuilder;
  private searcher!: DuckDuckGoSearcher | TavilySearcher;
  private crawler!: Crawler;
  private contextStore!: ContextStore;
  private noteIndexer!: NoteIndexer;
  private agentLoop!: AgentLoop;
  private toolRunner!: ToolRunner;
  private actionPlanner!: ActionPlanner;
  private templateRegistry!: TemplateRegistry;
  private progressIndicator!: ProgressIndicator;
  private scheduledRefreshTimer: number | null = null;
  private isRunning = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initServices();

    this.addSettingTab(new PenNoteSettingTab(this.app, this));

    this.registerView(
      VIEW_TYPE_PENNOTE,
      (leaf: WorkspaceLeaf) => new PanelView(leaf, this.handleChatMessage.bind(this))
    );

    this.registerCommands();
    this.registerEvents();

    this.app.workspace.onLayoutReady(async () => {
      await this.noteIndexer.buildIndex();
      this.maybeActivatePanel();
    });

    if (this.settings.enableScheduledRefresh) {
      this.scheduleRefresh();
    }
  }

  onunload(): void {
    if (this.scheduledRefreshTimer !== null) {
      clearInterval(this.scheduledRefreshTimer);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.llmClient.updateSettings(this.settings);
    this.crawler.updateSettings(this.settings);
    this.searcher = this.createSearcher();
    this.toolRunner = new ToolRunner(
      this.app,
      this.searcher,
      this.crawler,
      this.settings.searchResultLimit
    );
    this.agentLoop = new AgentLoop(
      this.llmClient,
      this.toolRunner,
      this.settings.maxAgentIterations
    );
  }

  private createSearcher(): DuckDuckGoSearcher | TavilySearcher {
    if (this.settings.searchProvider === "tavily") {
      return new TavilySearcher(this.settings.tavilyApiKey);
    }
    return new DuckDuckGoSearcher();
  }

  private initServices(): void {
    this.llmClient = new LLMClient(this.settings);
    this.queryBuilder = new QueryBuilder(this.llmClient);
    this.searcher = this.createSearcher();
    this.crawler = new Crawler(this.settings);
    this.noteIndexer = new NoteIndexer(this.app);
    this.templateRegistry = new TemplateRegistry();
    this.actionPlanner = new ActionPlanner(this.llmClient);

    this.toolRunner = new ToolRunner(
      this.app,
      this.searcher,
      this.crawler,
      this.settings.searchResultLimit
    );

    this.agentLoop = new AgentLoop(
      this.llmClient,
      this.toolRunner,
      this.settings.maxAgentIterations
    );

    this.progressIndicator = new ProgressIndicator(this);

    const storeData = (this.app as unknown as { loadLocalStorage?: (key: string) => string | null }).loadLocalStorage?.(STORE_KEY);
    let initialData: ContextStoreData | null = null;
    if (storeData) {
      try {
        initialData = JSON.parse(storeData);
      } catch {
        initialData = null;
      }
    }

    this.contextStore = new ContextStore(initialData, async (data) => {
      (this.app as unknown as { saveLocalStorage?: (key: string, value: string) => void }).saveLocalStorage?.(
        STORE_KEY,
        JSON.stringify(data)
      );
    });
  }

  private registerCommands(): void {
    this.addCommand({
      id: "enrich-note",
      name: "Enrich current note",
      editorCallback: (editor, view) => {
        if (!view.file) return;
        this.openCommandModal(view.file, "enrich");
      },
    });

    this.addCommand({
      id: "gap-analysis",
      name: "Analyze gaps in current note",
      editorCallback: (editor, view) => {
        if (!view.file) return;
        this.openCommandModal(view.file, "gap-analysis");
      },
    });

    this.addCommand({
      id: "add-command",
      name: "Add tool command to current note",
      editorCallback: (editor, view) => {
        if (!view.file) return;
        this.openCommandModal(view.file, "add-command");
      },
    });

    this.addCommand({
      id: "update-commands",
      name: "Update commands in current note",
      editorCallback: (editor, view) => {
        if (!view.file) return;
        this.openCommandModal(view.file, "search-update");
      },
    });

    this.addCommand({
      id: "convert-checklist",
      name: "Convert selection to checklist",
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (!selection.trim()) {
          new Notice("Select text first to convert to checklist.");
          return;
        }
        const result = convertToChecklist(selection);
        editor.replaceSelection(result);
      },
    });

    this.addCommand({
      id: "open-panel",
      name: "Open PenNote panel",
      callback: () => this.activatePanel(),
    });

    this.addCommand({
      id: "run-instruction",
      name: "Run custom instruction",
      editorCallback: (editor, view) => {
        if (!view.file) return;
        this.openCommandModal(view.file);
      },
    });

    this.addCommand({
      id: "scheduled-refresh-manual",
      name: "Run scheduled refresh now",
      callback: () => this.runScheduledRefresh(),
    });
  }

  private registerEvents(): void {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.noteIndexer.indexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.noteIndexer.indexFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.noteIndexer.removeFile(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle("PenNote: Open chat")
            .setIcon("message-square")
            .onClick(() => void this.activatePanel());
        });

        menu.addItem((item) => {
          item
            .setTitle("PenNote: Convert to checklist")
            .setIcon("check-square")
            .onClick(() => {
              const selection = editor.getSelection();
              if (selection.trim()) {
                editor.replaceSelection(convertToChecklist(selection));
              }
            });
        });

        if (view.file) {
          menu.addItem((item) => {
            item
              .setTitle("PenNote: Enrich note")
              .setIcon("shield")
              .onClick(() => this.openCommandModal(view.file!));
          });
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) => {
            item
              .setTitle("PenNote: Open chat")
              .setIcon("message-square")
              .onClick(() => void this.activatePanel());
          });
          menu.addItem((item) => {
            item
              .setTitle("PenNote: Enrich note")
              .setIcon("shield")
              .onClick(() => this.openCommandModal(file));
          });
        }
      })
    );
  }

  private openCommandModal(file: TFile, defaultMode?: string): void {
    const content = (() => {
      const summary = this.noteIndexer.getSummary(file.path);
      return summary || file.basename;
    })();

    new CommandModal(this.app, content, async (result) => {
      await this.runAgent(file, result.instruction, result.mode);
    }).open();
  }


  private async handleChatMessage(text: string, mode: string): Promise<void> {
    const panel = this.getPanelView();
    if (!panel) return;

    if (!this.settings.mistralApiKey) {
      panel.appendChatMessage({
        role: "assistant",
        text: "[!] No Mistral API key configured. Go to Settings → PenNote AI to add your key.",
        timestamp: Date.now(),
      });
      return;
    }

    if (this.isRunning) {
      panel.appendChatMessage({
        role: "assistant",
        text: "Still working on the previous task — please wait a moment.",
        timestamp: Date.now(),
      });
      return;
    }

    this.isRunning = true;
    this.progressIndicator.setState("thinking");

    const activeFile = this.app.workspace.getActiveFile();
    let noteBefore = "";
    let notePath = "";

    if (activeFile) {
      try {
        noteBefore = await this.app.vault.read(activeFile);
        notePath = activeFile.path;
      } catch { }
    }

    this.toolRunner.activeFilePath = notePath;

    const lower = text.toLowerCase();
    this.toolRunner.allowCreateNote =
      /(create|make|new)\s+(a\s+)?(new\s+)?note|start\s+a\s+new\s+note/.test(lower);

    if (!activeFile && !this.toolRunner.allowCreateNote) {
      panel.appendChatMessage({
        role: "assistant",
        text: "No active note is open. Please open a note in the editor first, or ask me to create a new one.",
        timestamp: Date.now(),
      });
      this.isRunning = false;
      this.progressIndicator.setState("idle");
      return;
    }

    const modePrefix: Record<string, string> = {
      "enrich":        "[Mode: enrich — add new techniques and updated information] ",
      "gap-analysis":  "[Mode: gap-analysis — find missing methodology sections and fill them] ",
      "add-command":   "[Mode: add-command — research and add tool commands with full syntax, flags, and examples] ",
      "search-update": "[Mode: search-update — search the web and refresh outdated content] ",
    };
    const instruction = (modePrefix[mode] ?? "") + text;

    panel.startPlanTracker();

    try {
      const result = await this.agentLoop.chatTurn(
        instruction,
        noteBefore,
        notePath,
        (log: AgentStepLog) => {
          panel.pushPlanStep(log);
          const stateMap: Record<string, "searching" | "crawling" | "thinking" | "writing"> = {
            search: "searching",
            crawl: "crawling",
            think: "thinking",
            write: "writing",
          };
          if (stateMap[log.type]) this.progressIndicator.setState(stateMap[log.type]);
        }
      ).finally(() => panel.finishPlanTracker());

      if (activeFile && notePath) {
        try {
          const noteAfter = await this.app.vault.read(activeFile);
          if (noteAfter !== noteBefore) {
            const hunks = computeDiff(noteBefore, noteAfter);
            const added = hunks.filter((h) => h.type === "added").reduce((n, h) => n + h.value.split("\n").length, 0);
            const removed = hunks.filter((h) => h.type === "removed").reduce((n, h) => n + h.value.split("\n").length, 0);
            panel.appendDiffSummary(added, removed, activeFile.basename);
          }
        } catch { }
      }

      panel.appendChatMessage({
        role: "assistant",
        text: result.finalContent.trim() || "Done.",
        timestamp: Date.now(),
      });
      panel.setTokenUsage(result.tokenUsage);

      if (activeFile && result.queriesUsed.length > 0) {
        await this.contextStore.addEnrichmentRecord({
          noteId: activeFile.path,
          timestamp: Date.now(),
          queriesUsed: result.queriesUsed,
          urlsCrawled: result.urlsCrawled,
          summary: result.finalContent.slice(0, 200),
        });
      }
    } catch (err) {
      const msg = `Error: ${err instanceof Error ? err.message : String(err)}`;
      panel.appendErrorWithRetry(msg, () => {
        void this.handleChatMessage(text, mode);
      });
    } finally {
      this.isRunning = false;
      this.progressIndicator.setState("idle");
    }
  }

  async runAgent(file: TFile, instruction: string, mode: string): Promise<void> {
    if (this.isRunning) {
      new Notice("PenNote is already running. Please wait.");
      return;
    }

    if (!this.settings.mistralApiKey) {
      new Notice("PenNote: No Mistral API key configured. Check Settings.");
      return;
    }

    this.isRunning = true;
    await this.activatePanel();
    const panel = this.getPanelView();

    panel?.startPlanTracker();
    panel?.setStatus("Running...");
    this.progressIndicator.setState("thinking");

    const logToPanel = (log: AgentStepLog) => {
      panel?.pushPlanStep(log);
      const stateMap: Record<string, "searching" | "crawling" | "thinking" | "writing"> = {
        search: "searching",
        crawl: "crawling",
        think: "thinking",
        write: "writing",
      };
      if (stateMap[log.type]) {
        this.progressIndicator.setState(stateMap[log.type]);
      }
    };

    try {
      let noteContent = "";
      try {
        noteContent = await this.app.vault.read(file);
      } catch {
        noteContent = "";
      }

      if (mode === "checklist") {
        const result = convertToChecklist(noteContent);
        await this.proposeAndApply(file, noteContent, result, panel);
        return;
      }

      if (mode === "gap-analysis") {
        const template = this.templateRegistry.detectTemplate(noteContent);
        if (template) {
          const gaps = this.templateRegistry.getMissingGaps(noteContent, template);
          if (gaps.length === 0) {
            new Notice("No gaps detected in this note based on the template.");
            panel?.setStatus("No gaps found.");
            return;
          }
          const gapNote = `## Identified Gaps\n\n${gaps.map((g) => `- [ ] Missing section: **${g}**`).join("\n")}\n`;
          await this.proposeAndApply(file, noteContent, noteContent + "\n\n" + gapNote, panel);
          new Notice(`Found ${gaps.length} gaps. Enriching with web search...`);
        }
      }

      const result = await this.agentLoop.run(
        instruction,
        noteContent,
        file.path,
        logToPanel
      );

      panel?.setTokenUsage(result.tokenUsage);

      await this.contextStore.addEnrichmentRecord({
        noteId: file.path,
        timestamp: Date.now(),
        queriesUsed: result.queriesUsed,
        urlsCrawled: result.urlsCrawled,
        summary: result.finalContent.slice(0, 200),
      });

      const updatedContent = await this.app.vault.read(file);

      if (result.urlsCrawled.length > 0) {
        const refs = result.urlsCrawled.map((url) => ({
          title: url,
          url,
          date: new Date().toISOString().split("T")[0],
        }));
        const refSection = buildReferencesSection(refs);
        if (refSection && !updatedContent.includes("## References")) {
          const withRefs = updatedContent.trimEnd() + "\n\n" + refSection;
          const patchedContent = updateFrontmatter(
            withRefs,
            "last_enriched",
            new Date().toISOString().split("T")[0]
          );
          await this.proposeAndApply(file, updatedContent, patchedContent, panel);
        }
      } else {
        if (result.finalContent.trim()) {
          const patched = updateFrontmatter(
            updatedContent,
            "last_enriched",
            new Date().toISOString().split("T")[0]
          );
          if (patched !== updatedContent) {
            await this.app.vault.modify(file, patched);
          }
        }
        new Notice("PenNote: Agent completed. Check the note for changes.");
      }

      panel?.setStatus("Done");
      panel?.finishPlanTracker();
      panel?.appendChatMessage({
        role: "assistant",
        text: `Enrichment complete. ${result.urlsCrawled.length} URL(s) crawled. Check the note for updates.`,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`PenNote error: ${msg}`, 8000);
      panel?.finishPlanTracker();
      panel?.appendLog({ type: "error", message: msg, timestamp: Date.now() });
      panel?.setStatus("Error");
    } finally {
      this.isRunning = false;
      this.progressIndicator.setState("idle");
    }
  }

  private async proposeAndApply(
    file: TFile,
    original: string,
    updated: string,
    panel: PanelView | null
  ): Promise<void> {
    if (original === updated) {
      new Notice("PenNote: No changes to apply.");
      return;
    }

    const hunks: DiffHunk[] = computeDiff(original, updated);
    const threshold = this.settings.autoConfirmThreshold;

    if (threshold === "always" || (threshold === "small-changes" && isSmallChange(hunks))) {
      await this.app.vault.modify(file, applyPatch(original, hunks));
      new Notice("PenNote: Changes applied.");
      panel?.appendLog({ type: "write", message: "Changes applied to note.", timestamp: Date.now() });
      return;
    }

    new DiffReviewModal(
      this.app,
      hunks,
      async () => {
        await this.app.vault.modify(file, applyPatch(original, hunks));
        new Notice("PenNote: Changes accepted and applied.");
        panel?.appendLog({ type: "write", message: "Changes accepted by user.", timestamp: Date.now() });
      },
      () => {
        new Notice("PenNote: Changes rejected.");
        panel?.appendLog({ type: "think", message: "Changes rejected by user.", timestamp: Date.now() });
      }
    ).open();
  }

  private async runScheduledRefresh(): Promise<void> {
    const stale = this.noteIndexer.getByTag(this.settings.methodologyTag);
    const cutoff = Date.now() - this.settings.refreshIntervalDays * 24 * 60 * 60 * 1000;

    const toRefresh = stale.filter((e) => e.lastModified < cutoff);
    if (toRefresh.length === 0) {
      new Notice("PenNote: All methodology notes are up to date.");
      return;
    }

    new Notice(`PenNote: Refreshing ${toRefresh.length} stale notes...`);
    for (const entry of toRefresh) {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) {
        await this.runAgent(file, "Update this note with recent techniques and verify all commands are current.", "search-update");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private scheduleRefresh(): void {
    if (this.scheduledRefreshTimer !== null) return;
    const intervalMs = this.settings.refreshIntervalDays * 24 * 60 * 60 * 1000;
    this.scheduledRefreshTimer = window.setInterval(() => {
      this.runScheduledRefresh();
    }, intervalMs);
  }

  private async activatePanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PENNOTE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_PENNOTE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private maybeActivatePanel(): void {
  }

  private getPanelView(): PanelView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PENNOTE);
    if (leaves.length > 0 && leaves[0].view instanceof PanelView) {
      return leaves[0].view;
    }
    return null;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
}
