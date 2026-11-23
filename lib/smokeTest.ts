/**
 * `GEN TEST` harness builder. Each runtime gets a harness in its own syntax;
 * JavaScript syntax is never injected into another language.
 *
 * - JavaScript / TypeScript: run the purified artifact unchanged first, so
 *   every real `console.log(...)` reaches the terminal. Then, only when the
 *   program emitted no output, invoke safe top-level functions with sample
 *   arguments and print their return values. Finally print `SMOKE_MARKER`.
 * - Python 3: same idea with a wrapped `print`, `assert callable(<fn>)`, and
 *   the marker.
 * - Every other runtime: run the artifact unchanged; pass when the run
 *   completes with exit code 0.
 */

import { findLanguage } from "@/lib/languages";

export const SMOKE_MARKER = "ALL SMOKE TESTS PASSED";
const MAX_ASSERTIONS = 40;

/** Names that must never be auto-invoked by the smoke harness. */
const UNSAFE_AUTO_CALLS =
  /^(?:fetch|setInterval|setTimeout|setImmediate|requestAnimationFrame|queueMicrotask|createRoot|render|hydrate|import|require|eval|exec|use[A-Z]\w*|componentDid\w*|constructor)$/i;

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function jsParams(code: string, name: string): string[] {
  const escaped = escapeRegex(name);
  const declaration = new RegExp(
    `^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s*\\*?\\s*${escaped}\\s*\\(([^)\\n]*)\\)`,
    "m",
  );
  const assigned = new RegExp(
    `^(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*(?::[^=\\n]+)?=\\s*(?:async\\s+)?(?:function\\s*\\(([^)\\n]*)\\)|\\(([^)\\n]*)\\)\\s*(?::[^=\\n]+)?=>|([A-Za-z_$][\\w$]*)\\s*=>)`,
    "m",
  );
  const match = code.match(declaration) ?? code.match(assigned);
  if (!match) return [];
  const raw = match[1] ?? match[2] ?? match[3] ?? "";
  return raw
    .split(",")
    .map((part) => part.split("=")[0].trim().replace(/[?:\s].*$/, ""))
    .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part));
}

function pythonParams(code: string, name: string): string[] {
  const escaped = escapeRegex(name);
  const match =
    code.match(new RegExp(`^async\\s+def\\s+${escaped}\\s*\\(([^)\\n]*)\\)`, "m")) ??
    code.match(new RegExp(`^def\\s+${escaped}\\s*\\(([^)\\n]*)\\)`, "m"));
  if (!match) return [];
  return match[1]
    .split(",")
    .map((part) => part.split("=")[0].trim().replace(/:.*$/, ""))
    .filter((part) => /^[A-Za-z_]\w*$/.test(part) && part !== "self");
}

/** Deterministic, harmless values for smoke-calling a pure top-level function. */
function sampleArg(param: string, index: number): string | number | boolean | Array<string | number> | Record<string, unknown> {
  const key = param.toLowerCase().replace(/[^a-z]/g, "");
  if (/(?:^|spirit|soul|user|item|entity)(?:name)$/.test(key) || key === "spiritname" || key === "name") {
    return "wraith";
  }
  if (/(?:^id$|id$|identifier)/.test(key)) return "wraith";
  if (/(?:level|power|count|index|limit|times|n)/.test(key)) return 1;
  if (key === "a") return 6;
  if (key === "b") return 3;
  if (/(?:x|value|number|num|amount|input)/.test(key)) return 7;
  if (/(?:flag|enabled|active|ok|strict)/.test(key)) return true;
  if (/(?:items|arr|array|list|values|spirits|ghosts)/.test(key)) return [1, 2, 3];
  if (/(?:obj|config|options|payload|data)/.test(key)) return {};
  return index === 0 ? "wraith" : 1;
}

function safeFunctions(names: string[]): string[] {
  return names.filter((name) => !UNSAFE_AUTO_CALLS.test(name));
}

function pythonLiteral(value: unknown): string {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${JSON.stringify(key)}: ${pythonLiteral(item)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value) ?? "None";
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

/** JS/TS formatter injected into the harness so return values look like a REPL. */
function jsFormatter(types: boolean): string[] {
  const cast = (type: string) => (types ? `(value as ${type})` : "value");
  return [
    types
      ? "const __necroFormat = (value: unknown): string => {"
      : "const __necroFormat = (value) => {",
    '  if (value === undefined) return "undefined";',
    '  if (value === null) return "null";',
    '  if (typeof value === "string") return JSON.stringify(value);',
    `  if (typeof value === "function") return "[Function " + (${cast("{ name?: string }")}.name || "anonymous") + "]";`,
    `  if (value instanceof Error) return ${cast("Error")}.message;`,
    '  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }',
    "};",
  ];
}

/** Console wrapper that counts emitted lines without changing their text. */
function jsConsoleTracking(types: boolean): string[] {
  const methods = ["log", "info", "debug", "warn", "error"];
  const keyParam = types ? "key: string" : "key";
  const argsParam = types ? "...args: unknown[]" : "...args";
  return [
    types
      ? `const __necroConsole: Record<string, (...args: unknown[]) => unknown> = { ${methods.map((method) => `${method}: console.${method}`).join(", ")} };`
      : `const __necroConsole = { ${methods.map((method) => `${method}: console.${method}`).join(", ")} };`,
    "let __necroOutputCount = 0;",
    `const __necroTrack = (${keyParam}) => (${argsParam}) => {`,
    "  __necroOutputCount += 1;",
    "  return __necroConsole[key].apply(console, args);",
    "};",
    ...methods.map((method) => `console.${method} = __necroTrack(${JSON.stringify(method)});`),
  ];
}

function jsConsoleRestore(): string[] {
  return ["log", "info", "debug", "warn", "error"].map(
    (method) => `console.${method} = __necroConsole.${method};`,
  );
}

/** Auto-call block for pure function files that produced no top-level output. */
function jsAutoCalls(calls: Array<{ name: string; args: unknown[] }>, types: boolean): string[] {
  if (calls.length === 0) return [];
  const callType = types ? ": Array<{ name: string; args: unknown[] }>" : "";
  const errorParam = types ? "__necroError: unknown" : "__necroError";
  const invoke = types
    ? "      const __necroValue = await (__necroFn as (...args: unknown[]) => unknown)(...__necroCall.args);"
    : "      const __necroValue = await __necroFn(...__necroCall.args);";
  return [
    `const __necroCalls${callType} = ${JSON.stringify(calls)};`,
    "if (__necroOutputCount === 0) {",
    "  for (const __necroCall of __necroCalls) {",
    "    const __necroFn = __necroApi[__necroCall.name];",
    "    if (typeof __necroFn !== \"function\") continue;",
    "    const __necroLabel = __necroCall.name + \"(\" + __necroCall.args.map(__necroFormat).join(\", \") + \")\";",
    "    try {",
    invoke,
    "      console.log(\"→ \" + __necroLabel + \" => \" + __necroFormat(__necroValue));",
    `    } catch (${errorParam}) {`,
    "      console.log(\"→ \" + __necroLabel + \" threw \" + String(__necroError));",
    "    }",
    "  }",
    "}",
  ];
}

function buildJs(code: string): SmokeHarness {
  const body = stripExports(code.replace(/\r\n?/g, "\n"));
  const functions = extractJsFunctions(body);
  const calls = safeFunctions(functions).map((name) => ({
    name,
    args: jsParams(body, name).map(sampleArg),
  }));
  const source = [
    ...jsFormatter(false),
    ...jsConsoleTracking(false),
    "const __necroApi = await (async () => {",
    body,
    `return ${apiObject(functions)};`,
    "})();",
    ...jsConsoleRestore(),
    ...jsAutoCalls(calls, false),
    ...jsAssertions(functions, "__necroAssert"),
    `console.log(${JSON.stringify(SMOKE_MARKER)});`,
  ].join("\n");
  // `__necroAssert` must exist before the artifact runs (it may call it).
  return {
    kind: "js-assert",
    source: `const __necroAssert = (condition, message) => {\n  if (!condition) throw new Error(message);\n};\n${source}`,
    functions,
    requiresMarker: true,
  };
}

function buildTs(code: string): SmokeHarness {
  const body = stripExports(code.replace(/\r\n?/g, "\n"));
  const functions = extractJsFunctions(body);
  const calls = safeFunctions(functions).map((name) => ({
    name,
    args: jsParams(body, name).map(sampleArg),
  }));
  const source = [
    "const __necroAssert = (condition: unknown, message: string): void => {",
    "  if (!condition) throw new Error(message);",
    "};",
    ...jsFormatter(true),
    ...jsConsoleTracking(true),
    "async function __necroRun(): Promise<Record<string, unknown>> {",
    body,
    `return ${apiObject(functions)};`,
    "}",
    "__necroRun()",
    "  .then(async (__necroApi: Record<string, unknown>) => {",
    ...jsConsoleRestore().map((line) => `    ${line}`),
    ...jsAutoCalls(calls, true).map((line) => `    ${line}`),
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
  const calls = safeFunctions(functions).map((name) => ({
    name,
    args: pythonParams(body, name).map(sampleArg),
  }));
  const callLines = calls.map(
    (call) =>
      `        ${call.name}(${call.args.map(pythonLiteral).join(", ")}),`,
  );
  const source = [
    "import builtins as __necroBuiltins",
    "__necro_output_count = 0",
    "def print(*args, **kwargs):",
    "    global __necro_output_count",
    "    __necro_output_count += 1",
    "    return __necroBuiltins.print(*args, **kwargs)",
    "",
    body,
    "",
    "",
    "# --- NecroCode GEN TEST: Python smoke harness ---",
    ...functions.map(
      (name) =>
        `assert callable(${name}), ${JSON.stringify(`${name} should exist after purification`)}`,
    ),
    "if __necro_output_count == 0:",
    "    for __necro_name, __necro_args in {",
    ...callLines,
    "    }.items():",
    "        try:",
    "            __necro_value = globals()[__necro_name](*__necro_args)",
    "            print(f\"→ {__necro_name}({', '.join(map(str, __necro_args))}) => {__necro_value!r}\")",
    "        except Exception as __necro_error:",
    "            print(f\"→ {__necro_name}({', '.join(map(str, __necro_args))}) threw {__necro_error}\")",
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
