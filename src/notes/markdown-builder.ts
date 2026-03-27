export function ensureCodeFence(content: string): string {
  return content.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang.trim() || "bash";
    return "```" + language + "\n" + code.trimEnd() + "\n```";
  });
}

export function normalizeHeadings(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let prevWasBlank = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,6}\s/.test(line);

    if (isHeading && !prevWasBlank && result.length > 0) {
      result.push("");
    }
    result.push(line);

    if (isHeading && i + 1 < lines.length && lines[i + 1].trim() !== "") {
      result.push("");
    }

    prevWasBlank = line.trim() === "";
  }

  return result.join("\n");
}

export function ensureSingleBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildSection(heading: string, level: number, body: string): string {
  const prefix = "#".repeat(Math.min(Math.max(level, 1), 6));
  return `${prefix} ${heading}\n\n${body.trim()}\n`;
}

export function appendSection(existingContent: string, newSection: string): string {
  const trimmed = existingContent.trimEnd();
  return trimmed + "\n\n" + newSection.trim() + "\n";
}

export function extractCodeBlocks(markdown: string): Array<{ lang: string; code: string }> {
  const results: Array<{ lang: string; code: string }> = [];
  const pattern = /```(\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(markdown)) !== null) {
    results.push({ lang: m[1].trim(), code: m[2].trim() });
  }
  return results;
}

export function extractToolNames(markdown: string): string[] {
  const codeBlocks = extractCodeBlocks(markdown);
  const toolNames = new Set<string>();
  const knownTools = [
    "nmap",
    "nikto",
    "sqlmap",
    "burpsuite",
    "metasploit",
    "msfconsole",
    "gobuster",
    "dirb",
    "dirbuster",
    "crackmapexec",
    "cme",
    "bloodhound",
    "sharphound",
    "mimikatz",
    "rubeus",
    "kerbrute",
    "hashcat",
    "john",
    "hydra",
    "medusa",
    "impacket",
    "secretsdump",
    "smbclient",
    "rpcclient",
    "enum4linux",
    "ldapdomaindump",
    "wfuzz",
    "ffuf",
    "feroxbuster",
    "nuclei",
    "amass",
    "subfinder",
    "httpx",
    "wpscan",
    "testssl",
    "linpeas",
    "winpeas",
    "pspy",
    "chisel",
    "socat",
    "ligolo",
    "proxychains",
    "evil-winrm",
    "xfreerdp",
    "rdesktop",
    "smbmap",
    "responder",
    "ntlmrelayx",
    "petitpotam",
    "coercer",
    "certipy",
    "adcs",
  ];

  for (const block of codeBlocks) {
    const words = block.code.split(/\s+/);
    if (words.length > 0) {
      const firstWord = words[0].toLowerCase().replace(/^[^a-z0-9]/, "");
      if (knownTools.includes(firstWord)) {
        toolNames.add(firstWord);
      }
    }
    for (const tool of knownTools) {
      if (block.code.toLowerCase().includes(tool)) {
        toolNames.add(tool);
      }
    }
  }

  return Array.from(toolNames);
}

export function buildReferencesSection(refs: Array<{ title: string; url: string; date: string }>): string {
  if (refs.length === 0) return "";
  const lines = refs.map((r) => `- [${r.title}](${r.url}) — accessed ${r.date}`);
  return "## References\n\n" + lines.join("\n") + "\n";
}

export function updateFrontmatter(content: string, key: string, value: string): string {
  const fmPattern = /^---\n([\s\S]*?)\n---/;
  const kvPattern = new RegExp(`^${key}:.*$`, "m");

  if (fmPattern.test(content)) {
    if (kvPattern.test(content)) {
      return content.replace(kvPattern, `${key}: ${value}`);
    }
    return content.replace(fmPattern, (match, inner) => {
      return `---\n${inner}\n${key}: ${value}\n---`;
    });
  }

  return `---\n${key}: ${value}\n---\n\n${content}`;
}

export interface SectionEntry {
  heading: string;
  level: number;
  startLine: number;
  endLine: number;
  content: string;
}

export function getSectionIndex(markdown: string): SectionEntry[] {
  const lines = markdown.split("\n");
  const entries: SectionEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s(.+)/);
    if (!m) continue;
    const level = m[1].length;
    const heading = m[2].trim();

    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const nm = lines[j].match(/^(#{1,6})\s/);
      if (nm && nm[1].length <= level) {
        end = j;
        break;
      }
    }

    entries.push({
      heading,
      level,
      startLine: i,
      endLine: end,
      content: lines.slice(i + 1, end).join("\n").trim(),
    });
  }

  return entries;
}
export function replaceSectionContent(
  markdown: string,
  heading: string,
  newBody: string,
  level = 2
): string {
  const lines = markdown.split("\n");
  const index = getSectionIndex(markdown);

  const match = index.find(
    (e) => e.heading.toLowerCase().trim() === heading.toLowerCase().trim()
  );

  if (!match) {
    const prefix = "#".repeat(level);
    return markdown.trimEnd() + `\n\n${prefix} ${heading}\n\n${newBody.trim()}\n`;
  }

  const headingLine = lines[match.startLine];
  const beforeHeading = lines.slice(0, match.startLine);
  const afterSection = lines.slice(match.endLine);

  const sectionLines = [headingLine, "", newBody.trim(), ""];

  return [...beforeHeading, ...sectionLines, ...afterSection].join("\n").replace(/\n{3,}/g, "\n\n");
}

export function upsertBulletInSection(
  markdown: string,
  heading: string,
  bulletText: string,
  matchPrefix?: string
): string {
  const index = getSectionIndex(markdown);
  const match = index.find(
    (e) => e.heading.toLowerCase().trim() === heading.toLowerCase().trim()
  );

  if (!match) {
    return markdown.trimEnd() + `\n\n## ${heading}\n\n- ${bulletText.trim()}\n`;
  }

  const lines = markdown.split("\n");
  const sectionLines = lines.slice(match.startLine + 1, match.endLine);

  if (matchPrefix) {
    const existingIdx = sectionLines.findIndex(
      (l) => l.match(/^\s*-\s+/) && l.toLowerCase().includes(matchPrefix.toLowerCase())
    );
    if (existingIdx !== -1) {
      const indent = sectionLines[existingIdx].match(/^(\s*)/)?.[1] ?? "";
      sectionLines[existingIdx] = `${indent}- ${bulletText.trim()}`;
      return [
        ...lines.slice(0, match.startLine + 1),
        ...sectionLines,
        ...lines.slice(match.endLine),
      ].join("\n");
    }
  }

  const insertAt = sectionLines.length;
  sectionLines.splice(insertAt, 0, `- ${bulletText.trim()}`);

  return [
    ...lines.slice(0, match.startLine + 1),
    ...sectionLines,
    ...lines.slice(match.endLine),
  ].join("\n");
}

export function buildSectionOutline(markdown: string): string {
  const index = getSectionIndex(markdown);
  if (index.length === 0) return "(no headings)";
  return index
    .map((e) => `${"  ".repeat(e.level - 1)}- ${"#".repeat(e.level)} ${e.heading} [line ${e.startLine + 1}]`)
    .join("\n");
}
