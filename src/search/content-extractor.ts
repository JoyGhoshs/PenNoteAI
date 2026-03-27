import type { CrawlResult } from "../types";

const MAX_TEXT_LENGTH = 12000;
const MAX_CODE_BLOCKS = 20;

export function extractContent(html: string, url: string): CrawlResult {
  let title = "";
  let content = "";
  const codeBlocks: string[] = [];

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");

    title = doc.querySelector("title")?.textContent?.trim() ?? "";

    const codeEls = doc.querySelectorAll("pre, code");
    for (const el of Array.from(codeEls).slice(0, MAX_CODE_BLOCKS)) {
      const text = el.textContent?.trim() ?? "";
      if (text.length > 10) {
        codeBlocks.push(text);
      }
    }

    const Readability = tryLoadReadability();
    if (Readability) {
      const reader = new Readability(doc);
      const article = reader.parse();
      if (article) {
        title = article.title ?? title;
        content = article.textContent ?? "";
      }
    } else {
      content = extractFallback(doc);
    }
  } catch {
    content = stripHtmlTags(html).slice(0, MAX_TEXT_LENGTH);
  }

  content = normalizeWhitespace(content).slice(0, MAX_TEXT_LENGTH);

  return {
    url,
    title,
    content,
    codeBlocks,
    timestamp: Date.now(),
  };
}

function tryLoadReadability(): (new (doc: Document) => { parse(): { title: string; textContent: string } | null }) | null {
  try {
    const mod = require("@mozilla/readability");
    return mod.Readability ?? mod.default?.Readability ?? null;
  } catch {
    return null;
  }
}

function extractFallback(doc: Document): string {
  const removeSelectors = [
    "nav",
    "header",
    "footer",
    "aside",
    "script",
    "style",
    "noscript",
    ".nav",
    ".header",
    ".footer",
    ".sidebar",
    ".advertisement",
    ".cookie-banner",
  ];
  for (const sel of removeSelectors) {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  }

  const main =
    doc.querySelector("main, article, .content, .post-content, .entry-content, #content") ??
    doc.body;

  return main?.textContent ?? doc.body?.textContent ?? "";
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
