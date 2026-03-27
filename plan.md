# PenNote AI — Obsidian Plugin Development Plan

## Overview

PenNote AI is an Obsidian plugin built for offensive security engineers. Its core responsibility is to maintain, enrich, and evolve penetration testing methodology notes using an LLM backend (Mistral) combined with a headless web crawler. The plugin understands the context of existing notes, can search the web for updated techniques, and writes structured Markdown content back into your vault.

---

## Problem Statement

Offensive security professionals accumulate methodology notes across engagements — recon steps, exploitation checklists, tool commands, payloads, and references. These notes become stale quickly as new tools, CVEs, techniques, and bypass methods emerge. Manually curating them is time-consuming. This plugin automates enrichment, gap-filling, and updating of those notes via an AI agent backed by live web search.

---

## Architecture

```
forkpad/
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
├── src/
│   ├── main.ts
│   ├── settings.ts
│   ├── types.ts
│   ├── llm/
│   │   ├── mistral-client.ts
│   │   ├── query-builder.ts
│   │   ├── prompt-templates.ts
│   │   └── tool-definitions.ts
│   ├── search/
│   │   ├── duckduckgo.ts
│   │   ├── crawler.ts
│   │   ├── useragent-pool.ts
│   │   └── content-extractor.ts
│   ├── memory/
│   │   ├── context-store.ts
│   │   ├── note-indexer.ts
│   │   └── session-memory.ts
│   ├── agent/
│   │   ├── agent-loop.ts
│   │   ├── tool-runner.ts
│   │   └── action-planner.ts
│   ├── notes/
│   │   ├── markdown-builder.ts
│   │   ├── checklist-engine.ts
│   │   ├── diff-patcher.ts
│   │   └── template-registry.ts
│   └── ui/
│       ├── panel-view.ts
│       ├── command-modal.ts
│       ├── progress-indicator.ts
│       └── diff-review-modal.ts
```

---

## Core Components

### 1. Plugin Entry Point (`src/main.ts`)

- Extends Obsidian `Plugin` class
- Registers all commands in the command palette
- Initializes all services on `onload()`
- Registers the side panel `ItemView`
- Loads and saves settings via `loadData()` / `saveData()`

### 2. LLM Layer (`src/llm/`)

**`mistral-client.ts`**
- Wraps Mistral API using direct `fetch` calls to `https://api.mistral.ai/v1/chat/completions`
- Supports streaming responses via `ReadableStream`
- Implements Mistral function calling (tool use) for structured agent operations
- Handles rate limiting with exponential backoff
- Handles 401 (bad key) and 429 (quota) explicitly

**`query-builder.ts`**
- Takes current note context and user instruction as input
- Constructs advanced search queries using Mistral
- Generates multiple query variants (exact phrase, site-specific, filetype-specific)
- Examples:
  - `site:github.com filetype:md SSRF bypass cloud metadata 2024`
  - `"Active Directory" lateral movement new techniques after:2024`
  - `HackTricks kerberoasting updated payloads`

**`prompt-templates.ts`**
- Stores all system prompts and instruction templates
- Prompt categories: enrich, gap-fill, command-update, summarize, checklist-convert, rewrite
- Uses structured output instructions to force Mistral to return Markdown or JSON

**`tool-definitions.ts`**
- Defines Mistral function call schemas for:
  - `search_web(query: string, num_results: number)`
  - `crawl_url(url: string)`
  - `read_note(note_path: string)`
  - `write_to_note(note_path: string, content: string, mode: "append" | "patch" | "replace")`
  - `create_note(path: string, content: string)`
  - `list_vault_notes(tag?: string, folder?: string)`

### 3. Search & Crawler (`src/search/`)

**`duckduckgo.ts`**
- Uses DuckDuckGo HTML endpoint (`https://html.duckduckgo.com/html/`) via `fetch`
- Parses result links and snippets from HTML response using regex or DOM parsing
- Returns ranked list of `{ title, url, snippet }` objects
- Implements query deduplication and result caching per session

**`useragent-pool.ts`**
- Maintains a static pool of realistic, up-to-date user agent strings covering Chrome (Windows, macOS, Linux), Firefox, and Edge across recent versions
- `getRandomUA()` selects a user agent from the pool on each request
- `getBrowserProfile(ua)` returns a matching set of browser fingerprint values (platform, vendor, language, viewport) consistent with the selected user agent
- Pool is versioned in code and can be extended without touching crawler logic
- Example entries:
  - `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`
  - `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`
  - `Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0`
  - `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0`

**`crawler.ts`**
- Uses Playwright (`playwright-core`) in headless mode
- Runs inside Electron (Obsidian desktop) which supports Node.js natively
- Launches Chromium headless browser
- Navigates to URL, waits for `networkidle`, extracts readable content
- Handles redirects, cookie walls (soft bypass via `page.evaluate`)
- Timeout protection: 15 seconds max per page
- Mobile variant skips Playwright and uses plain `fetch` as fallback

**Bot Detection Bypass — Playwright Layer:**
- On each new browser context, `useragent-pool.ts` supplies a random user agent; context is created with `browser.newContext({ userAgent: ua })`
- `page.setExtraHTTPHeaders()` injects a full set of browser-consistent headers on every request:
  - `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8`
  - `Accept-Language: en-US,en;q=0.9`
  - `Accept-Encoding: gzip, deflate, br`
  - `Connection: keep-alive`
  - `Upgrade-Insecure-Requests: 1`
  - `Sec-Fetch-Dest: document`
  - `Sec-Fetch-Mode: navigate`
  - `Sec-Fetch-Site: none`
  - `Sec-Fetch-User: ?1`
  - `DNT: 1`
- Viewport set to a realistic resolution matching the user agent profile (e.g., 1920x1080 for desktop Chrome)
- `navigator.webdriver` property overridden to `undefined` via `page.addInitScript()` to defeat Selenium/CDP detection
- `navigator.languages`, `navigator.platform`, `navigator.vendor` patched via init script to match the selected browser profile
- `chrome.runtime` stub injected when spoofing Chrome to prevent detection via missing Chrome object
- Referrer spoofed to `https://www.google.com/` for the first request to simulate organic search traffic
- Human-like delays: random 800ms–2500ms wait between page navigation and content extraction using `page.waitForTimeout()`
- Avoids parallel crawl of the same domain within a 5-second window to reduce rate-limit fingerprinting

**Bot Detection Bypass — Fetch Layer (fallback):**
- Plain `fetch` requests use the same random user agent from `useragent-pool.ts`
- Full browser header set injected manually in the `fetch` options `headers` object
- `Referer` header set to `https://www.google.com/` to simulate search click-through
- `cache: 'no-store'` and `credentials: 'omit'` used to avoid cookie/session tracking
- Follows redirects via `redirect: 'follow'`

**`content-extractor.ts`**
- Cleans raw HTML using `@mozilla/readability` (Mozilla's Readability library)
- Strips nav, ads, footers, scripts
- Extracts: title, body text, code blocks, numbered lists
- Truncates content to fit within Mistral context window (token budget)
- Preserves code blocks as-is for command/tool extraction

### 4. Memory & Context (`src/memory/`)

**`context-store.ts`**
- Persistent storage using Obsidian's `loadData()` / `saveData()`
- Stores: previous searches, crawled summaries, enrichment history per note
- Provides relevant snippets from past crawls when re-enriching the same note topic
- Simple keyword-based relevance (no embedding dependency by default)

**`note-indexer.ts`**
- Indexes vault notes by: tags, headings, internal links, frontmatter fields
- Builds a topic graph: which notes reference which tools or techniques
- Used by the agent to understand scope before writing
- Incremental re-index on file change events

**`session-memory.ts`**
- Maintains the current agent conversation turn history
- Keeps last N turns in memory for multi-step reasoning
- Injects relevant note context at the start of each session
- Cleared at plugin unload or on user command

### 5. Agent Loop (`src/agent/`)

**`agent-loop.ts`**
- Implements the ReAct pattern (Reason + Act)
- Turn flow:
  1. Receive user instruction + current note content
  2. Call Mistral with tool definitions enabled
  3. If model returns a tool call — run the tool via `tool-runner.ts`
  4. Append tool result to conversation and repeat
  5. When model returns final `content` with no tool call — write output
- Max iteration cap (default 10) to avoid runaway loops
- Logs each step to a session log visible in the panel

**`tool-runner.ts`**
- Executes tool calls returned by Mistral
- Routes to: search, crawl, read_note, write_to_note, list_vault_notes
- Validates tool arguments against schema before execution
- Returns structured result objects back to the agent loop

**`action-planner.ts`**
- Pre-agent step: given user instruction, generates a brief execution plan
- Used to display intent to user before running (confirmation modal option)
- Can be skipped with a "run immediately" setting

### 6. Note Management (`src/notes/`)

**`markdown-builder.ts`**
- Generates well-structured Markdown from LLM output
- Handles: headings, bullet points, numbered lists, code fences with language tags
- Enforces consistent formatting (single blank line between sections)

**`checklist-engine.ts`**
- Converts methodology prose into `- [ ]` checklist items
- Detects existing checklist items and avoids duplication
- Supports nested checklists for multi-step processes

**`diff-patcher.ts`**
- Computes line-level diff between original note and proposed new content
- Highlights additions (green) and removals (red) in a review modal before applying
- Uses Myers diff algorithm via `diff` npm package
- User approves or rejects changes before write

**`template-registry.ts`**
- Stores built-in templates: Recon, Initial Access, Privilege Escalation, Lateral Movement, Exfil, Post-Exploitation, Web Application, Active Directory, Cloud (AWS/Azure/GCP)
- Each template defines: sections, default checklist items, expected tool references
- Used by gap-fill feature to detect what is missing from a note

### 7. UI (`src/ui/`)

**`panel-view.ts`**
- Registers a right-panel `ItemView` with `VIEW_TYPE_PENNOTE`
- Shows: current agent status, last search queries used, step-by-step log, final output preview
- Displays token usage per session

**`command-modal.ts`**
- `SuggestModal` that accepts free-text instruction from the user
- Pre-populates with context: current note title, current selection
- Dropdown for mode: Enrich, Gap Analysis, Add Command, Search Update, Convert to Checklist

**`progress-indicator.ts`**
- Status bar item showing live agent state: Searching / Crawling / Thinking / Writing
- Spinner during long operations
- Dismissible notice on completion

**`diff-review-modal.ts`**
- Full-screen modal showing side-by-side diff
- Accept All / Reject All / Accept Section buttons
- Keyboard shortcut support

---

## Feature Specifications

### Feature 1: Note Enrichment

**Trigger:** Command palette > "PenNote: Enrich current note"

**Flow:**
1. Read active note content
2. Agent analyzes note, identifies methodology topic
3. Agent generates 3-5 search queries targeting recent updates, tools, payloads
4. Searches DuckDuckGo, selects top 5 URLs
5. Crawls each URL, extracts relevant content
6. Mistral synthesizes new information, merges with existing note
7. Diff shown in review modal
8. User approves, note is patched

### Feature 2: Gap Analysis

**Trigger:** Command palette > "PenNote: Analyze gaps"

**Flow:**
1. Read active note, detect methodology type from headings + frontmatter
2. Load matching template from registry
3. Agent compares note against template sections
4. Lists missing sections/steps with brief reasoning
5. Optionally auto-fills missing sections using search

### Feature 3: Command Update

**Trigger:** Command palette > "PenNote: Update commands in note"

**Flow:**
1. Extract all code blocks from note
2. For each tool referenced, search for latest version, syntax changes, new flags
3. Agent proposes updated command variants
4. Diff shown per code block

### Feature 4: Add New Point

**Trigger:** User instruction via modal, e.g. "Add a section on SSRF bypass techniques using cloud metadata endpoints"

**Flow:**
1. Agent plans search strategy
2. Searches + crawls
3. Writes new Markdown section in appropriate position (after heading detection)
4. Appends to note or inserts at cursor

### Feature 5: Convert to Checklist

**Trigger:** Select text, right-click > "PenNote: Convert selection to checklist"

**Flow:**
1. Selected prose sent to Mistral with checklist instruction
2. Returns `- [ ]` formatted checklist
3. Replaces selection

### Feature 6: Scheduled Methodology Refresh

**Trigger:** Configurable interval (weekly/monthly) or manual command

**Flow:**
1. Scans all notes with tag `#methodology` or folder `Pentest/`
2. Runs gap analysis + command update on each
3. Queues diffs for user review in a dedicated "Updates" panel

---

## Settings (`src/settings.ts`)

```typescript
interface PenNoteSettings {
  mistralApiKey: string;
  mistralModel: string;
  searchResultLimit: number;
  crawlTimeoutMs: number;
  maxAgentIterations: number;
  autoConfirmThreshold: "always" | "never" | "small-changes";
  methodologyRootFolder: string;
  methodologyTag: string;
  enableScheduledRefresh: boolean;
  refreshIntervalDays: number;
  playwrightEnabled: boolean;
  contextWindowTokenBudget: number;
  debugMode: boolean;
}
```

---

## Development Phases

### Phase 1 — Foundation (Week 1-2)

- Obsidian plugin scaffold: `manifest.json`, `esbuild.config.mjs`, `tsconfig.json`, `package.json`
- Settings tab with Mistral API key input and test connection button
- Basic command palette entry that opens instruction modal
- Direct Mistral chat completion (no tools yet), writes response as note append
- esbuild bundling working, hot-reload in dev vault

**Deliverable:** Plugin loads, settings work, can call Mistral and append text to a note.

### Phase 2 — Search & Crawl (Week 3-4)

- DuckDuckGo HTML search implementation
- Playwright headless crawler setup and integration
- Content extractor with Readability
- Unit test: given a URL, extract clean text
- Session cache for search results

**Deliverable:** Can search DDG, crawl top results, return clean content.

### Phase 3 — Agent Loop (Week 5-6)

- Mistral tool/function calling integration
- Agent loop with ReAct pattern
- Tool runner wiring: search, crawl, read_note, write_to_note
- Query builder using Mistral to generate advanced search queries
- Step-by-step log in side panel

**Deliverable:** Agent can autonomously search and write to notes based on an instruction.

### Phase 4 — Note Intelligence (Week 7-8)

- Note indexer building topic graph from vault
- Template registry with 8 built-in pentest methodology templates
- Gap analysis feature
- Diff-patcher and review modal
- Checklist engine

**Deliverable:** Gap analysis works, diffs shown before write, checklist conversion works.

### Phase 5 — Memory & Context (Week 9)

- Context store persisting search history per note
- Session memory injected as LLM context
- Note indexer integrated into agent context injection
- Context token budget management (truncate intelligently)

**Deliverable:** Agent remembers previous enrichments and avoids duplicate work.

### Phase 6 — Polish & Advanced Features (Week 10-12)

- Scheduled refresh system
- Progress indicator and status bar
- Command update feature (code block extraction + update)
- Error handling and edge case coverage
- README and sample vault

---

## Technical Stack

| Component | Library / Approach |
|---|---|
| Language | TypeScript |
| Bundler | esbuild |
| LLM | Mistral AI (`/v1/chat/completions` with tool use) |
| Search | DuckDuckGo HTML endpoint via `fetch` |
| Headless Browser | Playwright (`playwright-core`) |
| HTML Parsing | `@mozilla/readability` + `DOMParser` |
| Diff Engine | `diff` npm package (Myers algorithm) |
| Persistent Storage | Obsidian `Plugin.loadData()` / `saveData()` |
| UI | Obsidian native: `Modal`, `ItemView`, `SettingTab` |
| Note Metadata | Obsidian `MetadataCache` API |

---

## Mistral Configuration

**Recommended model:** `mistral-large-latest` for agent loop (supports function calling)

**Fallback:** `mistral-small-latest` for simple enrichment tasks (lower cost)

**Context strategy:**
- System prompt: role as an offensive security AI research assistant
- Injected note content truncated to 6000 tokens max
- Search results chunked to 1000 tokens each, top 3 chunks selected by keyword relevance
- Tool call results kept under 2000 tokens each

**Advanced query generation prompt approach:**
- Input: current note topic + user instruction
- Output: JSON array of 4-6 search query strings
- Queries must include: date range hints, site-specific operators, technical jargon variants, exploit db terms, CVE references where applicable

---

## Agent Prompt Design

**System prompt structure:**

```
You are a specialized offensive security research assistant embedded in Obsidian.
Your task is to help a penetration tester maintain accurate, up-to-date methodology notes.

You have access to the following tools:
- search_web: search DuckDuckGo with an advanced query
- crawl_url: visit a URL and extract its readable content
- read_note: read a note from the vault by path
- write_to_note: write or patch content to a note
- list_vault_notes: list notes by tag or folder

Rules:
- Always verify information from at least 2 sources before writing
- Prefer authoritative sources: GitHub repos, HackTricks, ired.team, PayloadsAllTheThings, exploit-db
- Preserve all existing content unless explicitly asked to replace
- Write in consistent Markdown with proper heading hierarchy
- Use code fences with language identifiers for all commands
- Do not invent commands you have not verified from a source
- When adding commands, include: tool name, syntax, example output, purpose
- Flag deprecated tools or techniques with a note
```

---

## Security Considerations

- Mistral API key stored in Obsidian's encrypted settings via `saveData()` — never logged or exposed in UI
- User confirmation required before any write operation (configurable)
- Crawled content sanitized before passing to LLM (strip scripts, remove URLs from prompt context before display)
- Playwright runs with no sandbox only if explicitly enabled by user
- Max agent iterations enforced to prevent runaway API costs
- No outbound calls except to Mistral API and user-initiated searches

---

## Improvement Ideas

### Idea 1: MITRE ATT&CK Mapping
- Detect technique references in notes (e.g., "Pass the Hash", "Kerberoasting")
- Auto-tag with MITRE ATT&CK technique IDs (T1550.002)
- Link to official ATT&CK page and add detection/mitigation context

### Idea 2: Mistral Embeddings for Semantic Note Search
- Use `mistral-embed` model to embed all notes on index
- When enriching, find semantically related notes and inject as context
- Detect duplicate content across notes and suggest consolidation

### Idea 3: Payload & Command Versioning
- Track history of command changes per note as a hidden frontmatter field
- Show changelog: "command updated on 2025-03-12 — added `--no-pass` flag based on impacket v0.12"

### Idea 4: Source Bibliography
- Every enrichment appends a `## References` section with all crawled URLs and access dates
- Backlink from each added point to its source URL

### Idea 5: HackTricks Awareness
- Dedicated crawler integration for `book.hacktricks.xyz`
- Map current note topic to corresponding HackTricks page automatically
- Diff against HackTricks content to detect local note staleness

### Idea 6: Engagement Context Mode
- User sets active engagement scope (web app, AD, cloud, IoT)
- All enrichments and searches are scoped to that context
- Prevents adding irrelevant technique suggestions

### Idea 7: Checklist Execution Tracking
- Checkboxes in methodology notes are linked to real command output
- User runs a command, pastes output, plugin marks checklist item done and timestamps it
- Generates execution log per engagement

### Idea 8: Offline Mode with Cached Knowledge Base
- Pre-crawled and embedded snapshots of key resources (HackTricks, GTFOBins, LOLBAS, PayloadsAllTheThings)
- Stored locally in vault as hidden notes
- Used as fallback when no network or API key is available

### Idea 9: Multi-note Synthesis
- Select 3-5 notes on related topics
- Agent produces a unified consolidated note with deduplication
- Useful for synthesizing notes taken across multiple engagements

### Idea 10: Red Team Report Draft
- Based on methodology notes + completed checklists, generate a section of a pentest report
- Uses Mistral to rewrite technical notes into professional report language
- Output: narrative paragraphs per finding with remediation suggestions

---

## Key Reference Resources for Development

- Obsidian Plugin API: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- Obsidian Sample Plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- Mistral Function Calling Docs: https://docs.mistral.ai/capabilities/function_calling/
- Playwright Node.js API: https://playwright.dev/docs/api/class-playwright
- Mozilla Readability: https://github.com/mozilla/readability
- DuckDuckGo HTML search: https://html.duckduckgo.com/html/
- PayloadsAllTheThings: https://github.com/swisskyrepo/PayloadsAllTheThings
- HackTricks: https://book.hacktricks.xyz
- MITRE ATT&CK: https://attack.mitre.org

---

## File Naming & Vault Convention

- Methodology root folder configurable, default: `Pentest/`
- Notes tagged with `#methodology` are included in scheduled refresh scope
- Agent-generated notes placed in `Pentest/Generated/` unless user specifies otherwise
- All enriched notes get frontmatter field: `last_enriched: YYYY-MM-DD`
- Source references appended under `## References` heading at bottom of note

---

## Getting Started — First Sprint Commands

```bash
cd forkpad
npm init -y
npm install --save-dev typescript esbuild @types/node
npm install obsidian
npm install diff @mozilla/readability playwright-core
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

Minimal `manifest.json`:
```json
{
  "id": "pennote-ai",
  "name": "PenNote AI",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "AI-powered penetration testing methodology notes enrichment with live web search.",
  "author": "maheer",
  "isDesktopOnly": true
}
```

`isDesktopOnly: true` is required because Playwright and Node.js dependencies cannot run on Obsidian mobile.
