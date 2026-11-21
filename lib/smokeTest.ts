/**
 * `GEN TEST` harness builder. Each runtime gets a harness in its own syntax;
 * JavaScript syntax is never injected into another language.
 *
 * - JavaScript (local Web Worker), TypeScript / TSX (remote): assert that every
 *   top-level function still exists, then print `SMOKE_MARKER`.
 * - Python 3 (remote): append `assert callable(<fn>)` for each top-level
 *   `def`, then `print(SMOKE_MARKER)`.
 * - Every other runtime (remote): run the artifact unchanged; pass when the
 *   run completes with exit code 0.
 */

import { findLanguage } from "@/lib/languages";

export const SMOKE_MARKER = "ALL SMOKE TESTS PASSED";
const MAX_ASSERTIONS = 40;

export type SmokeHarnessKind = "js-assert" | "ts-assert" | "py-assert" | "runtime";

export interface SmokeHarness {
  kind: SmokeHarnessKind;
  /** Source sent to the sandbox. */
  source: string;
  /** Function names asserted (empty = execution-only smoke check). */
  functions: string[];
  /** The run must print `SMOKE_MARKER` to pass. */
  requiresMarker: boolean;
}

function unique(names: string[]): string[] {
  return Array.from(new Set(names)).slice(0, MAX_ASSERTIONS);
}

/** Top-level (column 0) JS/TS function declarations and arrow/function consts. */
export function extractJsFunctions(code: string): string[] {
  const names: string[] = [];
  const declaration =
    /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/gm;
  const assigned =
    /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:function\b|\([^)\n]*\)\s*(?::[^=\n]+)?=>|[A-Za-z_$][\w$]*\s*=>)/gm;
  for (const match of code.matchAll(declaration)) names.push(match[1]);
  for (const match of code.matchAll(assigned)) names.push(match[1]);
  return unique(names);
}

/** Top-level (column 0) Python `def` / `async def` names. */
export function extractPythonFunctions(code: string): string[] {
  const names: string[] = [];
  for (const match of code.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm)) {
    names.push(match[1]);
  }
  return unique(names);
}

/**
 * `export` is invalid inside the function body the harness wraps the artifact
 * in, so strip it from top-level declarations.
 */
function stripExports(code: string): string {
  return code
    .replace(/^export\s+default\s+(?=(?:async\s+)?function\b|class\b)/gm, "")
    .replace(
      /^export\s+(?=(?:async\s+)?function\b|class\b|const\b|let\b|var\b|interface\b|type\b|enum\b|abstract\b)/gm,
      "",
    );
}

function apiObject(names: string[]): string {
  return `{ ${names
    .map((name) => `${name}: typeof ${name} === "function" ? ${name} : undefined`)
    .join(", ")} }`;
}

function jsAssertions(names: string[], assert: string): string[] {
  return names.map(
    (name) =>
      `${assert}(typeof __necroApi.${name} === "function", ${JSON.stringify(`${name} should exist after purification`)});`,
  );
}

function buildJs(code: string): SmokeHarness {
  const body = stripExports(code.replace(/\r\n?/g, "\n"));
  const functions = extractJsFunctions(body);
  const source = [
    "const __necroAssert = (condition, message) => {",
    "  if (!condition) throw new Error(message);",
    "};",
    "const __necroApi = await (async () => {",
    body,
    `return ${apiObject(functions)};`,
    "})();",
    ...jsAssertions(functions, "__necroAssert"),
    `console.log(${JSON.stringify(SMOKE_MARKER)});`,
  ].join("\n");
  return { kind: "js-assert", source, functions, requiresMarker: true };
}

function buildTs(code: string): SmokeHarness {
  const body = stripExports(code.replace(/\r\n?/g, "\n"));
  const functions = extractJsFunctions(body);
  // No top-level await: the remote compiler's module target is unknown.
  const source = [
    "const __necroAssert = (condition: unknown, message: string): void => {",
    "  if (!condition) throw new Error(message);",
    "};",
    "async function __necroRun(): Promise<Record<string, unknown>> {",
    body,
    `return ${apiObject(functions)};`,
    "}",
    "__necroRun()",
    "  .then((__necroApi: Record<string, unknown>) => {",
    ...jsAssertions(functions, "    __necroAssert"),
    `    console.log(${JSON.stringify(SMOKE_MARKER)});`,
    "  })",
    "  .catch((error: unknown) => {",
    "    console.error(error instanceof Error ? error.message : String(error));",
    "    const proc = (globalThis as { process?: { exitCode?: number } }).process;",
    "    if (proc) proc.exitCode = 1;",
    "  });",
  ].join("\n");
  return { kind: "ts-assert", source, functions, requiresMarker: true };
}

function buildPython(code: string): SmokeHarness {
  const body = code.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const functions = extractPythonFunctions(body);
  const source = [
    body,
    "",
    "",
    "# --- NecroCode GEN TEST: Python smoke harness ---",
    ...functions.map(
      (name) =>
        `assert callable(${name}), ${JSON.stringify(`${name} should exist after purification`)}`,
    ),
    `print(${JSON.stringify(SMOKE_MARKER)})`,
    "",
  ].join("\n");
  return { kind: "py-assert", source, functions, requiresMarker: true };
}

export function buildSmokeHarness(code: string, languageId: string): SmokeHarness {
  const language = findLanguage(languageId);
  if (language.id === "javascript") return buildJs(code);
  if (language.id === "typescript" || language.id === "tsx") return buildTs(code);
  if (language.id === "python") return buildPython(code);
  return { kind: "runtime", source: code, functions: [], requiresMarker: false };
}

export interface SmokeRunOutcome {
  status: "complete" | "error" | "timeout";
  /** Remote exit code as reported by the runner; `null` for local runs. */
  exitCode: string | null;
  local: boolean;
  stdoutLines: string[];
}

/** Decide PASS / FAIL for a finished `GEN TEST` run. */
export function smokePassed(harness: SmokeHarness, run: SmokeRunOutcome): boolean {
  if (run.status !== "complete") return false;
  if (!run.local && run.exitCode !== "0") return false;
  if (harness.requiresMarker) {
    return run.stdoutLines.some((line) => line.trim() === SMOKE_MARKER);
  }
  return true;
}

/** Badge text: assertion suites say `PASS`; execution-only checks say so. */
export function smokeLabel(harness: SmokeHarness, passed: boolean): string {
  const smokeOnly = harness.functions.length === 0;
  if (passed) return smokeOnly ? "PASS (Runtime Smoke Check)" : "PASS";
  return smokeOnly ? "FAIL (Runtime Smoke Check)" : "FAIL";
}
