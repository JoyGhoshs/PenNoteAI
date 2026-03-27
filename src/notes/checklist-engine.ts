const CODE_FENCE_PLACEHOLDER = "PENNOTE_CODE_FENCE_";

export function convertToChecklist(text: string): string {
  const blocks = extractCodeBlocks(text);
  let working = replaceCodeBlocks(text, blocks);

  const lines = working.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(CODE_FENCE_PLACEHOLDER)) {
      result.push(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }

    if (trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")) {
      result.push(line);
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const itemText = trimmed.slice(2).trim();
      if (itemText.length > 0) {
        result.push(`${indent}- [ ] ${itemText}`);
      } else {
        result.push(line);
      }
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const itemText = trimmed.replace(/^\d+\.\s*/, "").trim();
      if (itemText.length > 0) {
        result.push(`${indent}- [ ] ${itemText}`);
      } else {
        result.push(line);
      }
      continue;
    }

    if (trimmed.length > 0 && !trimmed.startsWith("|") && !trimmed.startsWith(">")) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      result.push(`${indent}- [ ] ${trimmed}`);
    } else {
      result.push(line);
    }
  }

  return restoreCodeBlocks(result.join("\n"), blocks);
}

export function deduplicateChecklistItems(existing: string, newItems: string): string {
  const existingItems = extractChecklistItems(existing);
  const existingSet = new Set(existingItems.map((i) => normalizeItem(i)));

  const newLines = newItems.split("\n");
  const filtered: string[] = [];

  for (const line of newLines) {
    const isCheckbox =
      line.trim().startsWith("- [ ]") ||
      line.trim().startsWith("- [x]") ||
      line.trim().startsWith("- [X]");

    if (isCheckbox) {
      const normalized = normalizeItem(line.trim());
      if (!existingSet.has(normalized)) {
        filtered.push(line);
        existingSet.add(normalized);
      }
    } else {
      filtered.push(line);
    }
  }

  return filtered.join("\n");
}

function extractChecklistItems(text: string): string[] {
  return text
    .split("\n")
    .filter(
      (l) =>
        l.trim().startsWith("- [ ]") ||
        l.trim().startsWith("- [x]") ||
        l.trim().startsWith("- [X]")
    );
}

function normalizeItem(item: string): string {
  return item
    .replace(/^[\s\-\[\]x]+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const pattern = /```[\s\S]*?```/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

function replaceCodeBlocks(text: string, blocks: string[]): string {
  let result = text;
  for (let i = 0; i < blocks.length; i++) {
    result = result.replace(blocks[i], `${CODE_FENCE_PLACEHOLDER}${i}`);
  }
  return result;
}

function restoreCodeBlocks(text: string, blocks: string[]): string {
  let result = text;
  for (let i = 0; i < blocks.length; i++) {
    result = result.replace(`${CODE_FENCE_PLACEHOLDER}${i}`, blocks[i]);
  }
  return result;
}
