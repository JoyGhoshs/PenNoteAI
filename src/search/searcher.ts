import type { PenNoteSettings, SearchResult } from "../types";
import { DuckDuckGoSearcher } from "./duckduckgo";
import { TavilySearcher } from "./tavily";
import { ParallelSearcher } from "./parallel";

export interface Searcher {
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

export function createSearcher(settings: PenNoteSettings): Searcher {
  if (settings.searchProvider === "parallel") return new ParallelSearcher();
  if (settings.searchProvider === "tavily") return new TavilySearcher(settings.tavilyApiKey);
  return new DuckDuckGoSearcher();
}
