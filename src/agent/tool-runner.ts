import { App, TFile } from "obsidian";
import type { CrawlResult, SearchResult } from "../types";
import { DuckDuckGoSearcher } from "../search/duckduckgo";
import { Crawler } from "../search/crawler";
import { replaceSectionContent, upsertBulletInSection } from "../notes/markdown-builder";

export interface ToolResult {
  success: boolean;
  data: string;
}

export class ToolRunner {
  activeFilePath = "";
  allowCreateNote = false;

  constructor(
    private app: App,
    private searcher: DuckDuckGoSearcher,
    private crawler: Crawler,
    private searchLimit: number
  ) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case "search_web":
        return this.searchWeb(String(args.query ?? ""), Number(args.num_results ?? this.searchLimit));

      case "crawl_url":
        return this.crawlUrl(String(args.url ?? ""));

      case "read_note":
        return this.readNote(String(args.path ?? ""));

      case "patch_note_section":
        return this.patchNoteSection(
          String(args.path ?? ""),
          String(args.heading ?? ""),
          String(args.new_body ?? ""),
          Number(args.heading_level ?? 2)
        );

      case "upsert_note_bullet":
        return this.upsertNoteBullet(
          String(args.path ?? ""),
          String(args.heading ?? ""),
          String(args.bullet_text ?? ""),
          args.match_prefix !== undefined ? String(args.match_prefix) : undefined
        );

      case "write_to_note":
        return this.writeToNote(
          String(args.path ?? ""),
          String(args.content ?? ""),
          String(args.mode ?? "append") as "append" | "prepend" | "replace"
        );

      case "create_note":
        if (!this.allowCreateNote) {
          return {
            success: false,
            data: "create_note is not permitted without explicit user approval. Tell the user you need their permission to create a new note, and ask them to confirm.",
          };
        }
        return this.createNote(String(args.path ?? ""), String(args.content ?? ""));

      case "list_vault_notes":
        return this.listVaultNotes(
          args.tag !== undefined ? String(args.tag) : undefined,
          args.folder !== undefined ? String(args.folder) : undefined
        );

      default:
        return { success: false, data: `Unknown tool: ${toolName}` };
    }
  }

  private async searchWeb(query: string, limit: number): Promise<ToolResult> {
    if (!query) return { success: false, data: "No query provided" };
    try {
      const results: SearchResult[] = await this.searcher.search(
        query,
        Math.min(limit, 10)
      );
      if (results.length === 0) {
        return { success: true, data: "No results found for that query." };
      }
      const formatted = results
        .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`)
        .join("\n\n");
      return { success: true, data: formatted };
    } catch (err) {
      return { success: false, data: `Search error: ${String(err)}` };
    }
  }

  private async crawlUrl(url: string): Promise<ToolResult> {
    if (!url || !url.startsWith("http")) {
      return { success: false, data: "Invalid URL. Must start with http." };
    }
    try {
      const result: CrawlResult = await this.crawler.crawl(url);
      let output = `Title: ${result.title}\n\nContent:\n${result.content}`;
      if (result.codeBlocks.length > 0) {
        const blocks = result.codeBlocks.slice(0, 5).map((b) => `\`\`\`\n${b}\n\`\`\``).join("\n\n");
        output += `\n\nCode Blocks:\n${blocks}`;
      }
      return { success: true, data: output.slice(0, 8000) };
    } catch (err) {
      return { success: false, data: `Crawl error: ${String(err)}` };
    }
  }

  private resolveFile(path: string): TFile | null {
    const target = path.trim() || this.activeFilePath;
    if (!target) return null;
    const normalized = target.endsWith(".md") ? target : target + ".md";
    const f = this.app.vault.getAbstractFileByPath(normalized) ?? this.app.vault.getAbstractFileByPath(target);
    return f instanceof TFile ? f : null;
  }

  private async readNote(path: string): Promise<ToolResult> {
    const file = this.resolveFile(path);
    if (!file) return { success: false, data: `Note not found: ${path}` };
    const content = await this.app.vault.read(file);
    return { success: true, data: content };
  }

  private async patchNoteSection(
    path: string,
    heading: string,
    newBody: string,
    headingLevel: number
  ): Promise<ToolResult> {
    if (!heading.trim()) return { success: false, data: "heading is required" };
    const normalized = path.endsWith(".md") ? path : path + ".md";
    const file = this.resolveFile(normalized);
    if (!file) return { success: false, data: `Note not found: ${normalized}` };
    try {
      const existing = await this.app.vault.read(file);
      const patched = replaceSectionContent(existing, heading, newBody, Math.min(Math.max(headingLevel || 2, 1), 6));
      await this.app.vault.modify(file, patched);
      return { success: true, data: `Patched section "${heading}" in ${normalized}` };
    } catch (err) {
      return { success: false, data: `Patch error: ${String(err)}` };
    }
  }

  private async upsertNoteBullet(
    path: string,
    heading: string,
    bulletText: string,
    matchPrefix?: string
  ): Promise<ToolResult> {
    if (!heading.trim()) return { success: false, data: "heading is required" };
    const normalized = path.endsWith(".md") ? path : path + ".md";
    const file = this.resolveFile(normalized);
    if (!file) return { success: false, data: `Note not found: ${normalized}` };
    try {
      const existing = await this.app.vault.read(file);
      const patched = upsertBulletInSection(existing, heading, bulletText, matchPrefix);
      await this.app.vault.modify(file, patched);
      const action = matchPrefix ? `Updated bullet matching "${matchPrefix}"` : `Added bullet`;
      return { success: true, data: `${action} in section "${heading}" of ${normalized}` };
    } catch (err) {
      return { success: false, data: `Upsert error: ${String(err)}` };
    }
  }

  private async writeToNote(
    path: string,
    content: string,
    mode: "append" | "prepend" | "replace"
  ): Promise<ToolResult> {
    const file = this.resolveFile(path);
    if (!file) {
      return { success: false, data: `Note not found: ${path}. Use create_note to create it first.` };
    }
    try {
      const existing = await this.app.vault.read(file);
      let newContent: string;
      if (mode === "append") {
        newContent = existing.trimEnd() + "\n\n" + content.trim() + "\n";
      } else if (mode === "prepend") {
        newContent = content.trim() + "\n\n" + existing.trimStart();
      } else {
        newContent = content;
      }
      await this.app.vault.modify(file, newContent);
      return { success: true, data: `Successfully wrote to ${file.path} (mode: ${mode})` };
    } catch (err) {
      return { success: false, data: `Write error: ${String(err)}` };
    }
  }

  private async createNote(path: string, content: string): Promise<ToolResult> {
    const normalized = path.endsWith(".md") ? path : path + ".md";
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      return { success: false, data: `Note already exists: ${normalized}. Use write_to_note to modify it.` };
    }
    try {
      const dir = normalized.split("/").slice(0, -1).join("/");
      if (dir) {
        const dirExists = this.app.vault.getAbstractFileByPath(dir);
        if (!dirExists) {
          await this.app.vault.createFolder(dir);
        }
      }
      await this.app.vault.create(normalized, content);
      return { success: true, data: `Created note: ${normalized}` };
    } catch (err) {
      return { success: false, data: `Create error: ${String(err)}` };
    }
  }

  private listVaultNotes(tag?: string, folder?: string): ToolResult {
    const files = this.app.vault.getMarkdownFiles();
    let filtered = files;

    if (folder) {
      const prefix = folder.endsWith("/") ? folder : folder + "/";
      filtered = filtered.filter((f) => f.path.startsWith(prefix) || f.path.startsWith(folder));
    }

    if (tag) {
      const normalizedTag = tag.replace(/^#/, "");
      filtered = filtered.filter((f) => {
        const cache = this.app.metadataCache.getFileCache(f);
        const fileTags = cache?.tags?.map((t) => t.tag.replace(/^#/, "")) ?? [];
        const fmTags = cache?.frontmatter?.tags ?? [];
        const allTags = [...fileTags, ...(Array.isArray(fmTags) ? fmTags : [fmTags])].map((t) =>
          String(t).replace(/^#/, "")
        );
        return allTags.includes(normalizedTag);
      });
    }

    if (filtered.length === 0) {
      return { success: true, data: "No notes found matching the criteria." };
    }

    const list = filtered.map((f) => `- ${f.path}`).join("\n");
    return { success: true, data: `Found ${filtered.length} notes:\n${list}` };
  }
}
