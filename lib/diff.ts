/**
 * Dependency-free line diff for the Spectral Diff viewer.
 *
 * Uses a prefix/suffix trim followed by an LCS matrix. Typical exorcisms only
 * change a handful of lines, so the trimmed middle stays tiny. Large unrelated
 * artifacts fall back to a remove-then-add block to keep the UI responsive.
 */

export type DiffKind = "same" | "removed" | "added";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

interface RawDiffLine {
  kind: DiffKind;
  text: string;
}

const MAX_LCS_CELLS = 1_500_000;

function splitLines(value: string): string[] {
  const normalized = value.replace(/\r\n?/g, "\n");
  if (normalized.length === 0) return [];
  return normalized.split("\n");
}

function lcsDiff(before: string[], after: string[]): RawDiffLine[] {
  const rows = before.length;
  const cols = after.length;
  const width = cols + 1;
  const table = new Uint32Array((rows + 1) * width);

  for (let i = rows - 1; i >= 0; i--) {
    const row = i * width;
    const nextRow = (i + 1) * width;
    for (let j = cols - 1; j >= 0; j--) {
      if (before[i] === after[j]) {
        table[row + j] = table[nextRow + j + 1] + 1;
      } else {
        const skipBefore = table[nextRow + j];
        const skipAfter = table[row + j + 1];
        table[row + j] = skipBefore >= skipAfter ? skipBefore : skipAfter;
      }
    }
  }

  const diff: RawDiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      diff.push({ kind: "same", text: before[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      diff.push({ kind: "removed", text: before[i] });
      i += 1;
    } else {
      diff.push({ kind: "added", text: after[j] });
      j += 1;
    }
  }

  while (i < rows) {
    diff.push({ kind: "removed", text: before[i] });
    i += 1;
  }
  while (j < cols) {
    diff.push({ kind: "added", text: after[j] });
    j += 1;
  }

  return diff;
}

function diffMiddle(before: string[], after: string[]): RawDiffLine[] {
  if (before.length === 0) {
    return after.map((text) => ({ kind: "added" as const, text }));
  }
  if (after.length === 0) {
    return before.map((text) => ({ kind: "removed" as const, text }));
  }
  if (before.length * after.length > MAX_LCS_CELLS) {
    return [
      ...before.map((text) => ({ kind: "removed" as const, text })),
      ...after.map((text) => ({ kind: "added" as const, text })),
    ];
  }
  return lcsDiff(before, after);
}

export function diffLines(original: string, purified: string): DiffLine[] {
  const before = splitLines(original);
  const after = splitLines(purified);

  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start += 1;
  }

  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }

  const middle = diffMiddle(
    before.slice(start, endBefore),
    after.slice(start, endAfter),
  );

  const result: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < start; i++) {
    result.push({ kind: "same", text: before[i], oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }

  for (const line of middle) {
    if (line.kind === "removed") {
      result.push({ kind: "removed", text: line.text, oldLine, newLine: null });
      oldLine += 1;
    } else if (line.kind === "added") {
      result.push({ kind: "added", text: line.text, oldLine: null, newLine });
      newLine += 1;
    } else {
      result.push({ kind: "same", text: line.text, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
  }

  for (let i = endBefore; i < before.length; i++) {
    result.push({ kind: "same", text: before[i], oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }

  return result;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "added") added += 1;
    else if (line.kind === "removed") removed += 1;
  }
  return { added, removed };
}
