import { requestUrl } from "obsidian";
import type { CrawlResult, PenNoteSettings } from "../types";
import { extractContent } from "./content-extractor";
import { buildFetchHeaders, getBrowserProfile, getRandomEntry } from "./useragent-pool";

interface PlaywrightPage {
  addInitScript: (script: string) => Promise<void>;
  goto: (url: string, opts: unknown) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  content: () => Promise<string>;
}

interface PlaywrightContext {
  newPage: () => Promise<PlaywrightPage>;
  close: () => Promise<void>;
}

interface PlaywrightBrowser {
  newContext: (opts: unknown) => Promise<PlaywrightContext>;
  close: () => Promise<void>;
}

interface DomainEntry {
  lastCrawlTime: number;
}

const STEALTH_INIT_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {} };
`;

export class Crawler {
  private domainMap = new Map<string, DomainEntry>();
  private playwrightEnabled: boolean;
  private timeoutMs: number;

  constructor(settings: PenNoteSettings) {
    this.playwrightEnabled = settings.playwrightEnabled;
    this.timeoutMs = settings.crawlTimeoutMs;
  }

  updateSettings(settings: PenNoteSettings): void {
    this.playwrightEnabled = settings.playwrightEnabled;
    this.timeoutMs = settings.crawlTimeoutMs;
  }

  async crawl(url: string): Promise<CrawlResult> {
    await this.respectDomainCooldown(url);

    if (this.playwrightEnabled) {
      try {
        return await this.crawlWithPlaywright(url);
      } catch {
        return await this.crawlWithFetch(url);
      }
    }
    return this.crawlWithFetch(url);
  }

  private async crawlWithPlaywright(url: string): Promise<CrawlResult> {
    const pw = this.loadPlaywright();
    if (!pw) return this.crawlWithFetch(url);

    const entry = getRandomEntry();
    const profile = getBrowserProfile(entry.ua);

    const browser = await pw.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
    });

    try {
      const context = await browser.newContext({
        userAgent: entry.ua,
        viewport: profile.viewport,
        locale: "en-US",
        timezoneId: "America/New_York",
        extraHTTPHeaders: buildFetchHeaders(entry.ua),
      });

      const page = await context.newPage();
      await page.addInitScript(STEALTH_INIT_SCRIPT);

      await page.addInitScript(
        `Object.defineProperty(navigator, 'platform', { get: () => '${profile.platform}' });
         Object.defineProperty(navigator, 'vendor', { get: () => '${profile.vendor}' });
         Object.defineProperty(navigator, 'languages', { get: () => ${JSON.stringify(profile.languages)} });`
      );

      await page.goto(url, { waitUntil: "networkidle", timeout: this.timeoutMs });

      const randomDelay = 800 + Math.floor(Math.random() * 1700);
      await page.waitForTimeout(randomDelay);

      const html = await page.content();
      await context.close();
      return extractContent(html, url);
    } finally {
      await browser.close();
    }
  }

  private async crawlWithFetch(url: string): Promise<CrawlResult> {
    const entry = getRandomEntry();
    const headers = buildFetchHeaders(entry.ua);

    const response = await requestUrl({
      url,
      method: "GET",
      headers,
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }

    return extractContent(response.text, url);
  }

  private async respectDomainCooldown(url: string): Promise<void> {
    try {
      const host = new URL(url).hostname;
      const now = Date.now();
      const entry = this.domainMap.get(host);
      if (entry) {
        const elapsed = now - entry.lastCrawlTime;
        if (elapsed < 5000) {
          await new Promise((r) => setTimeout(r, 5000 - elapsed));
        }
      }
      this.domainMap.set(host, { lastCrawlTime: Date.now() });
    } catch {
    }
  }

  private loadPlaywright(): { chromium: { launch: (opts: unknown) => Promise<PlaywrightBrowser> } } | null {
    try {
      return require("playwright-core");
    } catch {
      return null;
    }
  }
}
