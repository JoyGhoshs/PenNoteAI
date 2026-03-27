# PenNote AI

An Obsidian plugin that brings an agentic AI assistant directly into your penetration testing notes. It searches the web, crawls sources, and surgically updates your vault notes using live-verified information.

---

## Requirements

- Node.js 18 or later
- Obsidian 1.4.0 or later (desktop only)
- An API key for at least one supported provider (see Configuration)
- `playwright-core` and a Chromium browser (optional, for the Playwright crawler)

---

## Playwright crawler (optional)

The crawler can use a headless Chromium instance to handle JavaScript-heavy pages that block plain HTTP requests. This is optional. If disabled, the plugin falls back to a standard `fetch`-based crawler.

To enable it, install `playwright-core` and download the browser binary. Run these commands in the project directory (or any directory on the same machine where Node.js is available):

```
npm install playwright-core
npx playwright install chromium
```

Then in Obsidian go to Settings > PenNote AI > Search & Crawl and enable the "Enable Playwright Crawler" toggle.

If `playwright-core` is not installed the toggle has no effect and the plugin continues to use the plain crawler without errors.

---

## Build

Clone the repository, install dependencies, and compile:

```
npm install
node esbuild.config.mjs production
```

The build produces three files in the project root:

- `main.js`
- `manifest.json`
- `styles.css`

---

## Installation

1. Open your Obsidian vault folder.
2. Navigate to `.obsidian/plugins/`.
3. Create a folder named `pennote-ai`.
4. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
5. In Obsidian, go to Settings > Community plugins, enable "Community plugins" if prompted, then enable PenNote AI.

---

## Configuration

1. Go to Settings > PenNote AI.
2. Select the active provider from the dropdown.
3. Enter the API key and model for that provider.
4. Use the Test Connection button to verify the key.

Supported providers:

| Provider | Key source | Default model |
|---|---|---|
| Mistral AI | console.mistral.ai | mistral-large-latest |
| OpenAI | platform.openai.com | gpt-4o |
| Anthropic (Claude) | console.anthropic.com | claude-opus-4-6 |
| Google Gemini | aistudio.google.com | gemini-2.5-pro |
| xAI (Grok) | console.x.ai | grok-2-latest |
| Groq | console.groq.com/keys | moonshotai/kimi-k2-instruct |
| OpenRouter | openrouter.ai/keys | anthropic/claude-opus-4-5 |

All providers except Anthropic use the OpenAI-compatible chat completions API. Groq uses `https://api.groq.com/openai/v1`. OpenRouter exposes every major model under a single key. For Mistral the model is a dropdown; for all others the model is a free-text field so you can enter any model the provider supports.

---

## Opening the panel

Use the command palette (Ctrl+P) and run "Open PenNote AI panel", or click the ribbon icon. The panel opens in the right sidebar.

---

## Modes

Select a mode from the dropdown in the panel before sending a message.

| Mode | Behaviour |
|---|---|
| Chat | General conversational assistant with access to all tools |
| Enrich note | Searches the web and adds verified content to the active note |
| Gap analysis | Reads the active note, identifies missing sections, and fills them |
| Add command | Adds a specific tool or command to the appropriate note section |
| Search update | Runs targeted searches based on note content and refreshes outdated information |

---

## Agent tools

The agent has access to the following tools during a session:

| Tool | Description |
|---|---|
| `search_web` | Runs a DuckDuckGo search with advanced operators |
| `crawl_url` | Fetches and extracts the full text of a URL |
| `read_note` | Reads a vault note by path |
| `patch_note_section` | Replaces the body of a named section in a note |
| `upsert_note_bullet` | Adds or replaces a single bullet point within a section |
| `write_to_note` | Appends, prepends, or fully replaces a note's content |
| `create_note` | Creates a new note at the specified path |
| `list_vault_notes` | Lists notes filtered by tag or folder |

---

## File attachments

Click the `+` button in the input row to attach a plain-text file or PDF. The content is extracted and injected into the message context. Supported formats: `.txt`, `.md`, `.log`, `.csv`, `.json`, `.xml`, `.html`, `.pdf`.

---

## Notes

- The plugin is desktop-only. Mobile is not supported.
- All web requests are made through Obsidian's built-in `requestUrl` API; no external fetch proxy is used.
- The agent never modifies notes without first reading their current content.
- `create_note` is only available when a vault note is the active editor file, as a safety gate against accidental creation.
