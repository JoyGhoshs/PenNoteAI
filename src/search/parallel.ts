import { randomUUID } from "crypto";
import { request } from "https";
import type { SearchResult } from "../types";

const MCP_URL = "https://search.parallel.ai/mcp";
const PROTOCOL_VERSION = "2025-03-26";
const USER_AGENT = "PenNoteAI/0.1.0";

/** The anonymous Search MCP endpoint uses Fast mode and needs no credentials. */
export class ParallelSearcher {
  private nextId = 0;
  private sessionId?: string;
  private readonly searchSessionId = randomUUID();
  private initialized?: Promise<void>;

  constructor(private timeoutMs = 15000) {}

  async search(query: string, limit = 5, signal?: AbortSignal): Promise<SearchResult[]> {
    if (!query.trim()) throw new Error("No query provided");
    if (!Number.isFinite(limit) || limit < 1) throw new Error("Invalid search result limit");
    if (signal?.aborted) throw new Error("Parallel search cancelled");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    try {
      if (!this.initialized) {
        this.initialized = this.initialize(controller.signal).catch((error) => {
          this.initialized = undefined;
          this.sessionId = undefined;
          throw error;
        });
      }
      await this.initialized;
      const tool = await this.rpc("tools/call", {
        name: "web_search",
        arguments: { objective: query, search_queries: [query], session_id: this.searchSessionId },
      }, controller.signal);
      const text = (tool.content ?? []).filter((item: any) => item.type === "text")
        .map((item: any) => item.text).join("\n");
      if (tool.isError) throw new Error(text || "Parallel search failed");
      const data = tool.structuredContent ?? JSON.parse(text);
      if (!Array.isArray(data.results)) throw new Error("Invalid Parallel search results");
      const results: SearchResult[] = [];
      for (const result of data.results) {
        if (typeof result.url !== "string" || !Array.isArray(result.excerpts) ||
            !result.excerpts.every((excerpt: unknown) => typeof excerpt === "string")) {
          throw new Error("Invalid Parallel search result");
        }
        try {
          const url = new URL(result.url);
          if (url.protocol !== "https:" && url.protocol !== "http:") continue;
        } catch { continue; }
        results.push({
          title: typeof result.title === "string" && result.title ? result.title : result.url,
          url: result.url,
          snippet: result.excerpts.join("\n"),
        });
        if (results.length >= Math.min(Math.floor(limit), 10)) break;
      }
      return results;
    } catch (error) {
      if (timedOut) throw new Error("Parallel search timed out");
      if (controller.signal.aborted) throw new Error("Parallel search cancelled");
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  private async initialize(signal: AbortSignal): Promise<void> {
    const info = await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "pennote-ai", version: "0.1.0" },
    }, signal);
    if (info.protocolVersion !== PROTOCOL_VERSION) throw new Error("Unsupported Parallel MCP protocol");
    await this.rpc("notifications/initialized", {}, signal, true);
    const discovery = await this.rpc("tools/list", {}, signal);
    if (!discovery.tools?.some((tool: any) => tool.name === "web_search")) {
      throw new Error("Parallel MCP does not expose web_search");
    }
  }

  // Node HTTPS avoids browser CORS/User-Agent restrictions in desktop Obsidian.
  // Only this fixed MCP endpoint receives requests; credentials are never read.
  private rpc(method: string, params: object, signal: AbortSignal, notification = false): Promise<any> {
    const id = notification ? undefined : ++this.nextId;
    const sessionId = this.sessionId;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const req = request(MCP_URL, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "User-Agent": USER_AGENT,
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        },
      }, (response) => {
        const session = response.headers["mcp-session-id"];
        if (method === "initialize" && typeof session === "string") this.sessionId = session;
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) req.destroy(new Error("Parallel MCP response is too large"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            const status = response.statusCode ?? 0;
            // An expired transport session must not poison every later search.
            // Report this failure, then reconnect on the next requested search.
            if (status === 404 && sessionId && this.sessionId === sessionId) {
              this.initialized = undefined;
              this.sessionId = undefined;
            }
            if (status < 200 || status >= 300) throw new Error(`Parallel MCP failed: HTTP ${status}`);
            if (notification) { resolve(undefined); return; }
            const text = Buffer.concat(chunks).toString("utf8");
            const contentType = response.headers["content-type"] ?? "";
            const messages = contentType.includes("text/event-stream")
              ? text.split(/\r?\n\r?\n/).map((event) => event.split(/\r?\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart()).join("\n")).filter(Boolean).map((data) => JSON.parse(data))
              : [JSON.parse(text)];
            const message = messages.find((value) => value.id === id);
            if (!message || message.jsonrpc !== "2.0") throw new Error("Invalid Parallel MCP response");
            if (message.error) throw new Error(message.error.message || "Parallel MCP error");
            if (!message.result || typeof message.result !== "object") throw new Error("Missing Parallel MCP result");
            resolve(message.result);
          } catch (error) { reject(error); }
        });
      });
      req.on("error", reject);
      req.end(body);
    });
  }
}
