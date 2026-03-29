import { requestUrl } from "obsidian";
import type { SearchResult } from "../types";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

interface TavilySearchResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
}

export class TavilySearcher {
  private cache = new Map<string, { results: SearchResult[]; timestamp: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(private apiKey: string) {}

  updateApiKey(key: string): void {
    this.apiKey = key;
  }

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new Error("Tavily API key is not configured. Add it in Settings → PenNote AI → Search & Crawl.");
    }

    const cacheKey = `${query}::${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.results;
    }

    const response = await requestUrl({
      url: TAVILY_SEARCH_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: Math.min(limit, 10),
        search_depth: "basic",
        topic: "general",
      }),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Tavily search failed: HTTP ${response.status}`);
    }

    const data: TavilySearchResponse = response.json;
    const results: SearchResult[] = (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));

    this.cache.set(cacheKey, { results, timestamp: Date.now() });
    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
