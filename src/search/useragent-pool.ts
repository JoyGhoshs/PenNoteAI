import type { BrowserProfile } from "../types";

interface UAEntry {
  ua: string;
  profile: BrowserProfile;
}

const POOL: UAEntry[] = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    profile: {
      platform: "Win32",
      vendor: "Google Inc.",
      languages: ["en-US", "en"],
      viewport: { width: 1920, height: 1080 },
    },
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    profile: {
      platform: "Win32",
      vendor: "Google Inc.",
      languages: ["en-US", "en"],
      viewport: { width: 1440, height: 900 },
    },
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    profile: {
      platform: "MacIntel",
      vendor: "Google Inc.",
      languages: ["en-US", "en"],
      viewport: { width: 1512, height: 982 },
    },
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    profile: {
      platform: "MacIntel",
      vendor: "Apple Computer, Inc.",
      languages: ["en-US", "en"],
      viewport: { width: 1512, height: 982 },
    },
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    profile: {
      platform: "Linux x86_64",
      vendor: "",
      languages: ["en-US", "en"],
      viewport: { width: 1920, height: 1080 },
    },
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    profile: {
      platform: "Linux x86_64",
      vendor: "Google Inc.",
      languages: ["en-US", "en"],
      viewport: { width: 1920, height: 1080 },
    },
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    profile: {
      platform: "Win32",
      vendor: "Google Inc.",
      languages: ["en-US", "en"],
      viewport: { width: 1920, height: 1080 },
    },
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    profile: {
      platform: "Win32",
      vendor: "",
      languages: ["en-US", "en"],
      viewport: { width: 1680, height: 1050 },
    },
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0",
    profile: {
      platform: "MacIntel",
      vendor: "",
      languages: ["en-US", "en"],
      viewport: { width: 1280, height: 800 },
    },
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    profile: {
      platform: "Win32",
      vendor: "Google Inc.",
      languages: ["en-US", "en"],
      viewport: { width: 1366, height: 768 },
    },
  },
];

export function getRandomUA(): string {
  return POOL[Math.floor(Math.random() * POOL.length)].ua;
}

export function getBrowserProfile(ua: string): BrowserProfile {
  const entry = POOL.find((e) => e.ua === ua);
  if (entry) return entry.profile;
  return {
    platform: "Win32",
    vendor: "Google Inc.",
    languages: ["en-US", "en"],
    viewport: { width: 1920, height: 1080 },
  };
}

export function getRandomEntry(): UAEntry {
  return POOL[Math.floor(Math.random() * POOL.length)];
}

export function buildFetchHeaders(ua: string): Record<string, string> {
  return {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    DNT: "1",
    Referer: "https://www.google.com/",
  };
}
