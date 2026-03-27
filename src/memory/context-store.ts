import type { ContextStoreData, EnrichmentRecord } from "../types";

const CRAWL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENRICHMENT_RECORDS_PER_NOTE = 10;

export class ContextStore {
  private data: ContextStoreData = {
    enrichmentHistory: {},
    crawlCache: {},
  };

  private saveCallback: (data: ContextStoreData) => Promise<void>;

  constructor(
    initial: ContextStoreData | null,
    saveCallback: (data: ContextStoreData) => Promise<void>
  ) {
    if (initial) this.data = initial;
    this.saveCallback = saveCallback;
  }

  async addEnrichmentRecord(record: EnrichmentRecord): Promise<void> {
    const key = record.noteId;
    if (!this.data.enrichmentHistory[key]) {
      this.data.enrichmentHistory[key] = [];
    }
    this.data.enrichmentHistory[key].unshift(record);
    if (this.data.enrichmentHistory[key].length > MAX_ENRICHMENT_RECORDS_PER_NOTE) {
      this.data.enrichmentHistory[key] = this.data.enrichmentHistory[key].slice(
        0,
        MAX_ENRICHMENT_RECORDS_PER_NOTE
      );
    }
    await this.save();
  }

  getEnrichmentHistory(noteId: string): EnrichmentRecord[] {
    return this.data.enrichmentHistory[noteId] ?? [];
  }

  getPreviousQueries(noteId: string): string[] {
    return this.getEnrichmentHistory(noteId).flatMap((r) => r.queriesUsed);
  }

  getPreviousUrls(noteId: string): string[] {
    return this.getEnrichmentHistory(noteId).flatMap((r) => r.urlsCrawled);
  }

  async setCrawlCache(url: string, content: string): Promise<void> {
    this.data.crawlCache[url] = { content, timestamp: Date.now() };
    await this.save();
  }

  getCrawlCache(url: string): string | null {
    const entry = this.data.crawlCache[url];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CRAWL_CACHE_TTL_MS) {
      delete this.data.crawlCache[url];
      return null;
    }
    return entry.content;
  }

  async pruneExpiredCache(): Promise<void> {
    const now = Date.now();
    let changed = false;
    for (const url of Object.keys(this.data.crawlCache)) {
      if (now - this.data.crawlCache[url].timestamp > CRAWL_CACHE_TTL_MS) {
        delete this.data.crawlCache[url];
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  getData(): ContextStoreData {
    return this.data;
  }

  private async save(): Promise<void> {
    await this.saveCallback(this.data);
  }
}
