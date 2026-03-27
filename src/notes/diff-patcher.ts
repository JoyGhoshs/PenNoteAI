import type { DiffHunk } from "../types";

let diffLib: { diffLines: (a: string, b: string) => Array<{ value: string; added?: boolean; removed?: boolean }> } | null = null;

function getDiffLib() {
  if (!diffLib) {
    try {
      diffLib = require("diff");
    } catch {
      diffLib = null;
    }
  }
  return diffLib;
}

export function computeDiff(original: string, updated: string): DiffHunk[] {
  const lib = getDiffLib();
  if (lib) {
    const changes = lib.diffLines(original, updated);
    return changes.map((c) => ({
      type: c.added ? "added" : c.removed ? "removed" : "unchanged",
      value: c.value,
    }));
  }
  return simpleDiff(original, updated);
}

export function applyPatch(original: string, hunks: DiffHunk[]): string {
  return hunks
    .filter((h) => h.type !== "removed")
    .map((h) => h.value)
    .join("");
}

export function countChanges(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    const lines = h.value.split("\n").filter((l) => l.trim().length > 0).length;
    if (h.type === "added") added += lines;
    if (h.type === "removed") removed += lines;
  }
  return { added, removed };
}

export function isSmallChange(hunks: DiffHunk[], threshold = 20): boolean {
  const { added, removed } = countChanges(hunks);
  return added + removed <= threshold;
}

function simpleDiff(original: string, updated: string): DiffHunk[] {
  const origLines = original.split("\n");
  const updLines = updated.split("\n");
  const origSet = new Set(origLines);
  const updSet = new Set(updLines);
  const hunks: DiffHunk[] = [];

  for (const line of origLines) {
    if (!updSet.has(line)) {
      hunks.push({ type: "removed", value: line + "\n" });
    } else {
      hunks.push({ type: "unchanged", value: line + "\n" });
    }
  }

  for (const line of updLines) {
    if (!origSet.has(line)) {
      hunks.push({ type: "added", value: line + "\n" });
    }
  }

  return hunks;
}
