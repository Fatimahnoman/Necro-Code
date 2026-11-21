import { diffLines } from "@/lib/diff";
import { findLanguage } from "@/lib/languages";
import type {
  AgentEvent,
  AppliedFix,
  BugFinding,
  BugSeverity,
  EngineInfo,
  ExorcismSummary,
} from "@/lib/types";

// ── Code Health & Security Score ─────────────────────────────

/** Points deducted per finding. A clean artifact scores 100; the floor is 0. */
export const HEALTH_WEIGHTS: Record<BugSeverity, number> = {
  critical: 15,
  warning: 6,
  info: 2,
};

/** `100 − Σ weight(severity)`, clamped to 0–100. */
export function healthScore(findings: Pick<BugFinding, "severity">[]): number {
  let penalty = 0;
  for (const finding of findings) penalty += HEALTH_WEIGHTS[finding.severity];
  return Math.max(0, Math.min(100, 100 - penalty));
}

export type HealthTier = "cursed" | "haunted" | "pure";

export function healthTier(score: number): HealthTier {
  if (score >= 80) return "pure";
  if (score >= 50) return "haunted";
  return "cursed";
}

// ── git-apply compatible unified patch ───────────────────────

const PATCH_CONTEXT = 3;
const NO_EOL = "\\ No newline at end of file";

/**
 * Turn an editor filename or GitHub path into a safe repo-relative path.
 * Rejects absolute paths and `..`; falls back to `artifact.<ext>`.
 */
export function patchPath(name: string, extension = "js"): string {
  const parts = name
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");
  const safe =
    parts.length > 0 &&
    parts.every((part) => part !== ".." && !/[\u0000-\u001f"]/.test(part));
  return safe ? parts.join("/") : `artifact.${extension}`;
}

interface PatchLine {
  sign: " " | "-" | "+";
  text: string;
  /** This is the file's last line and it has no trailing newline. */
  noEol: boolean;
}

function splitForPatch(value: string): { lines: string[]; endsWithNewline: boolean } {
  const normalized = value.replace(/\r\n?/g, "\n");
  if (normalized.length === 0) return { lines: [], endsWithNewline: true };
  const endsWithNewline = normalized.endsWith("\n");
  const body = endsWithNewline ? normalized.slice(0, -1) : normalized;
  return { lines: body.split("\n"), endsWithNewline };
}

/**
 * Build a unified diff that `git apply` accepts, with `a/` and `b/` prefixes
 * and three lines of context. Returns `null` when nothing changed.
 *
 * The purified artifact keeps the original file's trailing-newline style, so
 * a live model that trims the final newline does not add a spurious hunk.
 */
export function buildUnifiedPatch(
  original: string,
  purified: string,
  path: string,
): string | null {
  const before = splitForPatch(original);
  const afterRaw = splitForPatch(purified);
  const after = { lines: afterRaw.lines, endsWithNewline: before.endsWithNewline };

  const oldText = before.lines.join("\n");
  const newText = after.lines.join("\n");
  if (oldText === newText && before.lines.length === after.lines.length) {
    return null;
  }

  const diff = diffLines(oldText, newText);
  const lastOld = before.lines.length;
  const lastNew = after.lines.length;

  const noEol = !before.endsWithNewline; // same for both sides
  const lines: PatchLine[] = diff.flatMap((line): PatchLine[] => {
    const isLastOld = line.oldLine !== null && line.oldLine === lastOld;
    const isLastNew = line.newLine !== null && line.newLine === lastNew;
    if (line.kind === "removed") {
      return [{ sign: "-", text: line.text, noEol: noEol && isLastOld }];
    }
    if (line.kind === "added") {
      return [{ sign: "+", text: line.text, noEol: noEol && isLastNew }];
    }
    // A shared line that is last on only one side differs in its newline,
    // so git needs it as a remove + add pair.
    if (noEol && isLastOld !== isLastNew) {
      return [
        { sign: "-", text: line.text, noEol: isLastOld },
        { sign: "+", text: line.text, noEol: isLastNew },
      ];
    }
    return [{ sign: " ", text: line.text, noEol: noEol && isLastOld }];
  });

  // Group changes into hunks with PATCH_CONTEXT lines of context.
  const changed = lines
    .map((line, index) => (line.sign === " " ? -1 : index))
    .filter((index) => index >= 0);
  if (changed.length === 0) return null;

  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const start = Math.max(0, index - PATCH_CONTEXT);
    const end = Math.min(lines.length - 1, index + PATCH_CONTEXT);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }

  // Old/new line numbers *before* each diff index.
  const oldBefore: number[] = [];
  const newBefore: number[] = [];
  let oldSeen = 0;
  let newSeen = 0;
  for (const line of lines) {
    oldBefore.push(oldSeen);
    newBefore.push(newSeen);
    if (line.sign !== "+") oldSeen += 1;
    if (line.sign !== "-") newSeen += 1;
  }

  const out: string[] = [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
  ];

  for (const [start, end] of ranges) {
    const slice = lines.slice(start, end + 1);
    const oldCount = slice.filter((line) => line.sign !== "+").length;
    const newCount = slice.filter((line) => line.sign !== "-").length;
    // Unified-diff convention: a zero-length side starts at the preceding line.
    const oldStart = oldCount === 0 ? oldBefore[start] : oldBefore[start] + 1;
    const newStart = newCount === 0 ? newBefore[start] : newBefore[start] + 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const line of slice) {
      out.push(`${line.sign}${line.text}`);
      if (line.noEol) out.push(NO_EOL);
    }
  }

  return `${out.join("\n")}\n`;
}

export interface AutopsyReportInput {
  originalCode: string;
  purifiedCode: string;
  findings: BugFinding[];
  appliedFixes: AppliedFix[];
  summary: ExorcismSummary | null;
  engine: EngineInfo;
  logs: AgentEvent[];
  language?: string;
  generatedAt?: Date;
}

function timestamp(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function codeFence(code: string, language = "js"): string {
  let fence = "````";
  while (code.includes(fence)) fence += "`";
  return `${fence}${language}\n${code.replace(/\r\n?/g, "\n")}\n${fence}`;
}

function inlineCode(value: string): string {
  let fence = "`";
  while (value.includes(fence)) fence += "`";
  return `${fence}${value}${fence}`;
}

export function buildAutopsyReport({
  originalCode,
  purifiedCode,
  findings,
  appliedFixes,
  summary,
  engine,
  logs,
  language = "javascript",
  generatedAt = new Date(),
}: AutopsyReportInput): string {
  const runnerLanguage = findLanguage(language);
  const first = logs[0]?.ts;
  const last = logs[logs.length - 1]?.ts;
  const firstMs = first ? Date.parse(first) : Number.NaN;
  const lastMs = last ? Date.parse(last) : Number.NaN;
  const durationMs =
    Number.isFinite(firstMs) && Number.isFinite(lastMs)
      ? Math.max(0, lastMs - firstMs)
      : null;

  const lines: string[] = [
    "# NecroCode Exorcism Autopsy Report",
    "",
    `- **Generated:** ${generatedAt.toISOString()}`,
    `- **Active AI engine:** ${engine.name} — ${engine.model}`,
    `- **Language:** ${runnerLanguage.label}`,
    `- **Ritual window:** ${timestamp(first)} → ${timestamp(last)}`,
    `- **Execution time:** ${durationMs === null ? "—" : `${durationMs} ms`}`,
    `- **Artifact:** ${
      summary?.lines ?? originalCode.split(/\r\n?|\n/).length
    } lines · ${summary?.chars ?? originalCode.length} chars`,
    "",
    "## Corruption Summary",
    "",
  ];

  if (summary) {
    lines.push(
      "| Detected | Fixed | Residual | Critical | Warning | Info |",
      "| :---: | :---: | :---: | :---: | :---: | :---: |",
      `| ${summary.detected} | ${summary.fixed} | ${summary.unresolved} | ${summary.critical} | ${summary.warning} | ${summary.info} |`,
    );
    if (summary.healthBefore !== undefined && summary.healthAfter !== undefined) {
      lines.push(
        "",
        `**Code Health & Security Score:** ${summary.healthBefore}/100 → ${summary.healthAfter}/100 ` +
          `(−${HEALTH_WEIGHTS.critical} per critical, −${HEALTH_WEIGHTS.warning} per warning, −${HEALTH_WEIGHTS.info} per info)`,
      );
    }
  } else {
    lines.push("_No corruption summary was returned by the engine._");
  }

  lines.push("", "## Detected Curses", "");
  if (findings.length === 0) {
    lines.push("_No curses detected — the artifact was already pure._");
  } else {
    findings.forEach((bug, index) => {
      lines.push(
        `### ${index + 1}. ${bug.title}`,
        "",
        `- **Severity:** ${bug.severity}`,
        `- **Location:** line ${bug.line}, column ${bug.column}`,
        `- **Explanation:** ${bug.message}`,
        `- **Counter-sigil:** ${bug.hint}`,
        `- **Auto-fixable:** ${bug.fixable ? "yes" : "no"}`,
      );
      const snippet = bug.snippet.replace(/\s+/g, " ").trim();
      if (snippet.length > 0) {
        lines.push(`- **Snippet:** ${inlineCode(snippet)}`);
      }
      lines.push("");
    });
  }

  lines.push("## Applied Counter-Sigils", "");
  if (appliedFixes.length === 0) {
    lines.push("_No automatic counter-sigils were applied._");
  } else {
    for (const fix of appliedFixes) {
      lines.push(
        `- **L${fix.line}** \`${fix.id}\` — ${fix.description}`,
      );
    }
  }

  lines.push(
    "",
    "## Original Cursed Code",
    "",
    codeFence(originalCode, runnerLanguage.extension),
    "",
    "## Purified Code",
    "",
    codeFence(purifiedCode, runnerLanguage.extension),
    "",
    "---",
    "",
    "_Generated by NecroCode — the haunted AI code exorcist._",
    "",
  );

  return lines.join("\n");
}
