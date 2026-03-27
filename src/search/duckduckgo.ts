import { requestUrl } from "obsidian";
import type { SearchResult } from "../types";
import { buildFetchHeaders, getRandomUA } from "./useragent-pool";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";

interface SearchCache {
  results: SearchResult[];
  timestamp: number;
}

export class DuckDuckGoSearcher {
  private cache = new Map<string, SearchCache>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const cacheKey = `${query}::${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.results;
    }

    const ua = getRandomUA();
    const headers = buildFetchHeaders(ua);

    const body = new URLSearchParams({ q: query, b: "", kl: "" });

    const response = await requestUrl({
      url: DDG_HTML_URL,
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
    }

    const html = response.text;
    const results = this.parseResults(html, limit);

    this.cache.set(cacheKey, { results, timestamp: Date.now() });
    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private parseResults(html: string, limit: number): SearchResult[] {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const results: SearchResult[] = [];

    const resultDivs = Array.from(
      doc.querySelectorAll("div.result.results_links, div.result.results_links_deep, div.result.web-result")
    );

    for (const div of resultDivs) {
      if (results.length >= limit) break;

      const titleAnchor = div.querySelector("h2.result__title > a.result__a") as HTMLAnchorElement | null;
      if (!titleAnchor) continue;

      const href = titleAnchor.getAttribute("href") ?? "";
      const url = this.extractUddgUrl(href);
      if (!url) continue;

      const title = titleAnchor.textContent?.trim() ?? "";
      if (!title) continue;

      const snippetEl = div.querySelector("a.result__snippet");
      const snippet = snippetEl?.textContent?.trim() ?? "";

      results.push({ title, url, snippet });
    }

    if (results.length > 0) return results;

    return this.regexFallbackParse(html, limit);
  }

  private extractUddgUrl(href: string): string {
    if (!href) return "";

    if (href.startsWith("http://") || href.startsWith("https://")) {
      try {
        const u = new URL(href);
        const uddg = u.searchParams.get("uddg");
        return uddg ? decodeURIComponent(uddg) : href;
      } catch {
        return href;
      }
    }

    if (href.startsWith("//")) {
      try {
        const u = new URL("https:" + href);
        const uddg = u.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      } catch {
        return "";
      }
    }

    if (href.startsWith("/l/")) {
      try {
        const u = new URL("https://duckduckgo.com" + href);
        const uddg = u.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      } catch {
        return "";
      }
    }

    return "";
  }

  private regexFallbackParse(html: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];

    const titleLinkPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetPattern = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetPattern.exec(html)) !== null) {
      snippets.push(sm[1].replace(/<[^>]+>/g, "").trim());
    }

    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = titleLinkPattern.exec(html)) !== null && results.length < limit) {
      const rawHref = m[1];
      const titleHtml = m[2];
      const url = this.extractUddgUrl(rawHref);
      if (!url) continue;
      const title = titleHtml.replace(/<[^>]+>/g, "").trim();
      if (!title) continue;
      results.push({ title, url, snippet: snippets[i] ?? "" });
      i++;
    }

    return results;
  }
}
