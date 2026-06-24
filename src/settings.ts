import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { LLMProvider, PenNoteSettings, SearchProvider } from "./types";
import { LLMClient } from "./llm/llm-client";

export const DEFAULT_SETTINGS: PenNoteSettings = {
  provider: "mistral",
  mistralApiKey: "",
  mistralModel: "mistral-large-latest",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  xaiApiKey: "",
  xaiModel: "grok-2-latest",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-pro",
  anthropicApiKey: "",
  anthropicModel: "claude-opus-4-6",
  openrouterApiKey: "",
  openrouterModel: "anthropic/claude-opus-4-5",
  groqApiKey: "",
  groqModel: "moonshotai/kimi-k2-instruct",
  searchProvider: "duckduckgo",
  tavilyApiKey: "",
  searchResultLimit: 5,
  crawlTimeoutMs: 15000,
  maxAgentIterations: 10,
  autoConfirmThreshold: "small-changes",
  methodologyRootFolder: "Pentest",
  methodologyTag: "methodology",
  enableScheduledRefresh: false,
  refreshIntervalDays: 7,
  playwrightEnabled: true,
  contextWindowTokenBudget: 8000,
  debugMode: false,
};

export class PenNoteSettingTab extends PluginSettingTab {
  plugin: Plugin & { settings: PenNoteSettings; saveSettings: () => Promise<void> };

  constructor(
    app: App,
    plugin: Plugin & { settings: PenNoteSettings; saveSettings: () => Promise<void> }
  ) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "PenNote AI" });
    containerEl.createEl("h3", { text: "Provider" });

    new Setting(containerEl)
      .setName("Active Provider")
      .setDesc("Select the LLM provider to use for all agent operations.")
      .addDropdown((drop) =>
        drop
          .addOption("mistral", "Mistral AI")
          .addOption("openai", "OpenAI")
          .addOption("anthropic", "Anthropic (Claude)")
          .addOption("gemini", "Google Gemini")
          .addOption("xai", "xAI (Grok)")
          .addOption("groq", "Groq")
          .addOption("openrouter", "OpenRouter")
          .setValue(this.plugin.settings.provider)
          .onChange(async (value) => {
            this.plugin.settings.provider = value as LLMProvider;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    const p = this.plugin.settings.provider;

    if (p === "mistral") {
      new Setting(containerEl)
        .setName("Mistral API Key")
        .setDesc("Your Mistral API key from console.mistral.ai")
        .addText((text) => {
          text.setPlaceholder("Enter API key...").setValue(this.plugin.settings.mistralApiKey).onChange(async (v) => {
            this.plugin.settings.mistralApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
      new Setting(containerEl)
        .setName("Model")
        .setDesc("Function calling requires mistral-large-latest or mistral-medium-latest.")
        .addDropdown((drop) =>
          drop
            .addOption("mistral-large-latest", "mistral-large-latest (recommended)")
            .addOption("mistral-medium-latest", "mistral-medium-latest")
            .addOption("mistral-small-latest", "mistral-small-latest")
            .setValue(this.plugin.settings.mistralModel)
            .onChange(async (v) => { this.plugin.settings.mistralModel = v; await this.plugin.saveSettings(); })
        );
    }

    if (p === "openai") {
      new Setting(containerEl)
        .setName("OpenAI API Key")
        .setDesc("Your OpenAI API key from platform.openai.com")
        .addText((text) => {
          text.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async (v) => {
            this.plugin.settings.openaiApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
      new Setting(containerEl)
        .setName("Model")
        .setDesc("e.g. gpt-4o, gpt-4-turbo, gpt-4o-mini")
        .addText((text) =>
          text.setPlaceholder("gpt-4o").setValue(this.plugin.settings.openaiModel).onChange(async (v) => {
            if (v.trim()) { this.plugin.settings.openaiModel = v.trim(); await this.plugin.saveSettings(); }
          })
        );
    }

    if (p === "anthropic") {
      new Setting(containerEl)
        .setName("Anthropic API Key")
        .setDesc("Your Anthropic API key from console.anthropic.com")
        .addText((text) => {
          text.setPlaceholder("sk-ant-...").setValue(this.plugin.settings.anthropicApiKey).onChange(async (v) => {
            this.plugin.settings.anthropicApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
      new Setting(containerEl)
        .setName("Model")
        .setDesc("e.g. claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5")
        .addText((text) =>
          text.setPlaceholder("claude-opus-4-6").setValue(this.plugin.settings.anthropicModel).onChange(async (v) => {
            if (v.trim()) { this.plugin.settings.anthropicModel = v.trim(); await this.plugin.saveSettings(); }
          })
        );
    }

    if (p === "gemini") {
      new Setting(containerEl)
        .setName("Gemini API Key")
        .setDesc("Your Gemini API key from aistudio.google.com")
        .addText((text) => {
          text.setPlaceholder("Enter API key...").setValue(this.plugin.settings.geminiApiKey).onChange(async (v) => {
            this.plugin.settings.geminiApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
      new Setting(containerEl)
        .setName("Model")
        .setDesc("e.g. gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash")
        .addText((text) =>
          text.setPlaceholder("gemini-2.5-pro").setValue(this.plugin.settings.geminiModel).onChange(async (v) => {
            if (v.trim()) { this.plugin.settings.geminiModel = v.trim(); await this.plugin.saveSettings(); }
          })
        );
    }

    if (p === "xai") {
      new Setting(containerEl)
        .setName("xAI API Key")
        .setDesc("Your xAI API key from console.x.ai")
        .addText((text) => {
          text.setPlaceholder("xai-...").setValue(this.plugin.settings.xaiApiKey).onChange(async (v) => {
            this.plugin.settings.xaiApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
      new Setting(containerEl)
        .setName("Model")
        .setDesc("e.g. grok-2-latest, grok-2-mini")
        .addText((text) =>
          text.setPlaceholder("grok-2-latest").setValue(this.plugin.settings.xaiModel).onChange(async (v) => {
            if (v.trim()) { this.plugin.settings.xaiModel = v.trim(); await this.plugin.saveSettings(); }
          })
        );
    }

    if (p === "groq") {
      new Setting(containerEl)
        .setName("Groq API Key")
        .setDesc("Your Groq API key from console.groq.com/keys")
        .addText((text) => {
          text.setPlaceholder("gsk_...").setValue(this.plugin.settings.groqApiKey).onChange(async (v) => {
            this.plugin.settings.groqApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
      new Setting(containerEl)
        .setName("Model")
        .setDesc("e.g. moonshotai/kimi-k2-instruct, llama-3.3-70b-versatile, mixtral-8x7b-32768")
        .addText((text) =>
          text.setPlaceholder("moonshotai/kimi-k2-instruct").setValue(this.plugin.settings.groqModel).onChange(async (v) => {
            if (v.trim()) { this.plugin.settings.groqModel = v.trim(); await this.plugin.saveSettings(); }
          })
        );
    }

    if (p === "openrouter") {
      new Setting(containerEl)
        .setName("OpenRouter API Key")
        .setDesc("Your OpenRouter API key from openrouter.ai/keys")
        .addText((text) => {
          text.setPlaceholder("sk-or-...").setValue(this.plugin.settings.openrouterApiKey).onChange(async (v) => {
            this.plugin.settings.openrouterApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
      new Setting(containerEl)
        .setName("Model")
        .setDesc("Full model ID from openrouter.ai/models — e.g. anthropic/claude-opus-4-5, openai/gpt-4o, google/gemini-2.5-pro")
        .addText((text) =>
          text.setPlaceholder("anthropic/claude-opus-4-5").setValue(this.plugin.settings.openrouterModel).onChange(async (v) => {
            if (v.trim()) { this.plugin.settings.openrouterModel = v.trim(); await this.plugin.saveSettings(); }
          })
        );
    }

    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc("Verify the active provider API key.")
      .addButton((btn) =>
        btn.setButtonText("Test").onClick(async () => {
          try {
            const client = new LLMClient(this.plugin.settings);
            await client.testConnection();
            new Notice(`${p} connection successful.`);
          } catch (err) {
            new Notice(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        })
      );

    containerEl.createEl("h3", { text: "Search & Crawl" });

    new Setting(containerEl)
      .setName("Search Provider")
      .setDesc("Select the web search provider to use for queries.")
      .addDropdown((drop) =>
        drop
          .addOption("duckduckgo", "DuckDuckGo")
          .addOption("tavily", "Tavily")
          .setValue(this.plugin.settings.searchProvider)
          .onChange(async (value) => {
            this.plugin.settings.searchProvider = value as SearchProvider;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.searchProvider === "tavily") {
      new Setting(containerEl)
        .setName("Tavily API Key")
        .setDesc("Your Tavily API key from app.tavily.com")
        .addText((text) => {
          text.setPlaceholder("tvly-...").setValue(this.plugin.settings.tavilyApiKey).onChange(async (v) => {
            this.plugin.settings.tavilyApiKey = v.trim();
            await this.plugin.saveSettings();
          });
          text.inputEl.type = "password";
          text.inputEl.style.width = "100%";
        });
    }

    new Setting(containerEl)
      .setName("Search Result Limit")
      .setDesc("Maximum number of search results to fetch per query.")
      .addSlider((slider) =>
        slider
          .setLimits(3, 10, 1)
          .setValue(this.plugin.settings.searchResultLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.searchResultLimit = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Crawl Timeout (ms)")
      .setDesc("Maximum time to wait for a page to load. Default 15000.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.crawlTimeoutMs))
          .onChange(async (value) => {
            const n = parseInt(value);
            if (!isNaN(n) && n >= 3000) {
              this.plugin.settings.crawlTimeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Enable Playwright Crawler")
      .setDesc("Use headless Chromium for JS-heavy pages. Requires playwright-core installed.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.playwrightEnabled).onChange(async (value) => {
          this.plugin.settings.playwrightEnabled = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Agent" });

    new Setting(containerEl)
      .setName("Max Agent Iterations")
      .setDesc("Maximum tool-call cycles per agent run to prevent runaway API usage.")
      .addSlider((slider) =>
        slider
          .setLimits(3, 20, 1)
          .setValue(this.plugin.settings.maxAgentIterations)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxAgentIterations = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-Confirm Writes")
      .setDesc("When to apply changes without showing the diff review modal.")
      .addDropdown((drop) =>
        drop
          .addOption("never", "Never (always review)")
          .addOption("small-changes", "Small changes only")
          .addOption("always", "Always (no review)")
          .setValue(this.plugin.settings.autoConfirmThreshold)
          .onChange(async (value) => {
            this.plugin.settings.autoConfirmThreshold = value as
              | "always"
              | "never"
              | "small-changes";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Context Window Token Budget")
      .setDesc("Max tokens from existing note injected into LLM context. Default 8000.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.contextWindowTokenBudget))
          .onChange(async (value) => {
            const n = parseInt(value);
            if (!isNaN(n) && n >= 1000) {
              this.plugin.settings.contextWindowTokenBudget = n;
              await this.plugin.saveSettings();
            }
          })
      );

    containerEl.createEl("h3", { text: "Vault" });

    new Setting(containerEl)
      .setName("Methodology Root Folder")
      .setDesc("Folder containing pentest methodology notes. Used for gap analysis and scheduled refresh.")
      .addText((text) =>
        text
          .setPlaceholder("Pentest")
          .setValue(this.plugin.settings.methodologyRootFolder)
          .onChange(async (value) => {
            this.plugin.settings.methodologyRootFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Methodology Tag")
      .setDesc("Tag applied to methodology notes for scoped operations (without #).")
      .addText((text) =>
        text
          .setPlaceholder("methodology")
          .setValue(this.plugin.settings.methodologyTag)
          .onChange(async (value) => {
            this.plugin.settings.methodologyTag = value.trim().replace(/^#/, "");
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Scheduled Refresh" });

    new Setting(containerEl)
      .setName("Enable Scheduled Refresh")
      .setDesc("Periodically re-enrich notes tagged with the methodology tag.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableScheduledRefresh).onChange(async (value) => {
          this.plugin.settings.enableScheduledRefresh = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Refresh Interval (days)")
      .setDesc("How often to check for stale notes.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 30, 1)
          .setValue(this.plugin.settings.refreshIntervalDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.refreshIntervalDays = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Debug Mode")
      .setDesc("Log verbose output to the browser console.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.debugMode).onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
