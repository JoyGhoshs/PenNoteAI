import { App, TFile } from "obsidian";
import type { NoteIndexEntry } from "../types";

export class NoteIndexer {
  private index = new Map<string, NoteIndexEntry>();
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async buildIndex(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    await Promise.all(files.map((f) => this.indexFile(f)));
  }

  async indexFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);

      const tags: string[] = [];
      if (cache?.tags) {
        tags.push(...cache.tags.map((t) => t.tag.replace(/^#/, "")));
      }
      if (cache?.frontmatter?.tags) {
        const ft = cache.frontmatter.tags;
        if (Array.isArray(ft)) {
          tags.push(...ft.map((t: string) => String(t).replace(/^#/, "")));
        } else if (typeof ft === "string") {
          tags.push(ft.replace(/^#/, ""));
        }
      }

      const headings: string[] = [];
      if (cache?.headings) {
        headings.push(...cache.headings.map((h) => h.heading));
      }

      const linkedPaths: string[] = [];
      if (cache?.links) {
        for (const link of cache.links) {
          const resolved = this.app.metadataCache.getFirstLinkpathDest(
            link.link,
            file.path
          );
          if (resolved) linkedPaths.push(resolved.path);
        }
      }

      this.index.set(file.path, {
        path: file.path,
        title: cache?.frontmatter?.title ?? file.basename,
        tags: [...new Set(tags)],
        headings,
        linkedPaths,
        lastModified: file.stat.mtime,
      });
    } catch {
    }
  }

  removeFile(path: string): void {
    this.index.delete(path);
  }

  getEntry(path: string): NoteIndexEntry | undefined {
    return this.index.get(path);
  }

  getByTag(tag: string): NoteIndexEntry[] {
    const normalizedTag = tag.replace(/^#/, "");
    return Array.from(this.index.values()).filter((e) =>
      e.tags.includes(normalizedTag)
    );
  }

  getByFolder(folder: string): NoteIndexEntry[] {
    const prefix = folder.endsWith("/") ? folder : folder + "/";
    return Array.from(this.index.values()).filter(
      (e) => e.path.startsWith(prefix) || e.path.startsWith(folder)
    );
  }

  getSummary(path: string): string {
    const entry = this.index.get(path);
    if (!entry) return "";
    return [
      `Title: ${entry.title}`,
      `Tags: ${entry.tags.join(", ") || "none"}`,
      `Sections: ${entry.headings.join(", ") || "none"}`,
    ].join("\n");
  }

  all(): NoteIndexEntry[] {
    return Array.from(this.index.values());
  }
}
