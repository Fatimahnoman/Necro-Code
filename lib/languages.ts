/**
 * Language registry shared by the editor, the SSE exorcism route, and the
 * sandbox runner. The builtin static scanner is JS/TS-only; every language in
 * this registry can still be executed through the remote runner.
 */

export type LanguageId =
  | "javascript"
  | "typescript"
  | "tsx"
  | "python"
  | "java"
  | "c"
  | "cpp"
  | "csharp"
  | "go"
  | "rust"
  | "ruby"
  | "php"
  | "kotlin"
  | "swift"
  | "scala"
  | "haskell"
  | "elixir"
  | "fsharp"
  | "d"
  | "perl"
  | "r"
  | "bash"
  | "sql"
  | "scheme"
  | "commonlisp"
  | "vb"
  | "objectivec"
  | "coffeescript"
  | "cobol"
  | "powershell"
  | "lua";

export interface RunnerLanguage {
  id: LanguageId;
  label: string;
  short: string;
  extension: string;
  /** The language identifier accepted by the remote execution engine. */
  paiza: string;
  /** JS/TS/TSX, Python and SQL can execute locally in the browser sandbox. */
  local: boolean;
  /** Extra context shown in the terminal before a remote run. */
  note?: string;
}

export const RUNNER_LANGUAGES: RunnerLanguage[] = [
  {
    id: "javascript",
    label: "JavaScript",
    short: "JS",
    extension: "js",
    paiza: "javascript",
    local: true,
  },
  {
    id: "typescript",
    label: "TypeScript",
    short: "TS",
    extension: "ts",
    paiza: "typescript",
    local: true,
    note: "TypeScript types are stripped locally with Sucrase before the artifact enters the Web Worker.",
  },
  {
    id: "tsx",
    label: "TSX / React",
    short: "TSX",
    extension: "tsx",
    paiza: "typescript",
    local: true,
    note: "TSX is transpiled locally with the classic JSX runtime; external React imports are sealed inside the worker.",
  },
  {
    id: "python",
    label: "Python 3",
    short: "PY",
    extension: "py",
    paiza: "python3",
    local: true,
    note: "Pyodide runs locally when available; otherwise the server runner provides real Python stdout/stderr.",
  },
  {
    id: "java",
    label: "Java",
    short: "JAVA",
    extension: "java",
    paiza: "java",
    local: false,
    note: "Java expects a public class with a main method.",
  },
  {
    id: "c",
    label: "C",
    short: "C",
    extension: "c",
    paiza: "c",
    local: false,
  },
  {
    id: "cpp",
    label: "C++",
    short: "C++",
    extension: "cpp",
    paiza: "cpp",
    local: false,
  },
  {
    id: "csharp",
    label: "C#",
    short: "C#",
    extension: "cs",
    paiza: "csharp",
    local: false,
  },
  {
    id: "go",
    label: "Go",
    short: "GO",
    extension: "go",
    paiza: "go",
    local: false,
  },
  {
    id: "rust",
    label: "Rust",
    short: "RS",
    extension: "rs",
    paiza: "rust",
    local: false,
  },
  {
    id: "ruby",
    label: "Ruby",
    short: "RB",
    extension: "rb",
    paiza: "ruby",
    local: false,
  },
  {
    id: "php",
    label: "PHP",
    short: "PHP",
    extension: "php",
    paiza: "php",
    local: false,
  },
  {
    id: "kotlin",
    label: "Kotlin",
    short: "KT",
    extension: "kt",
    paiza: "kotlin",
    local: false,
  },
  {
    id: "swift",
    label: "Swift",
    short: "SWIFT",
    extension: "swift",
    paiza: "swift",
    local: false,
  },
  {
    id: "scala",
    label: "Scala",
    short: "SCALA",
    extension: "scala",
    paiza: "scala",
    local: false,
  },
  {
    id: "haskell",
    label: "Haskell",
    short: "HS",
    extension: "hs",
    paiza: "haskell",
    local: false,
  },
  {
    id: "elixir",
    label: "Elixir",
    short: "EX",
    extension: "ex",
    paiza: "elixir",
    local: false,
  },
  {
    id: "fsharp",
    label: "F#",
    short: "F#",
    extension: "fs",
    paiza: "fsharp",
    local: false,
  },
  {
    id: "d",
    label: "D",
    short: "D",
    extension: "d",
    paiza: "d",
    local: false,
  },
  {
    id: "perl",
    label: "Perl",
    short: "PL",
    extension: "pl",
    paiza: "perl",
    local: false,
  },
  {
    id: "r",
    label: "R",
    short: "R",
    extension: "r",
    paiza: "r",
    local: false,
  },
  {
    id: "bash",
    label: "Bash",
    short: "SH",
    extension: "sh",
    paiza: "bash",
    local: false,
  },
  {
    id: "sql",
    label: "SQL",
    short: "SQL",
    extension: "sql",
    paiza: "mysql",
    local: true,
    note: "CREATE / INSERT / UPDATE / DELETE / SELECT run locally against a real in-memory table engine.",
  },
  {
    id: "scheme",
    label: "Scheme",
    short: "SCM",
    extension: "scm",
    paiza: "scheme",
    local: false,
  },
  {
    id: "commonlisp",
    label: "Common Lisp",
    short: "LISP",
    extension: "lisp",
    paiza: "commonlisp",
    local: false,
  },
  {
    id: "vb",
    label: "Visual Basic",
    short: "VB",
    extension: "vb",
    paiza: "vb",
    local: false,
  },
  {
    id: "objectivec",
    label: "Objective-C",
    short: "OBJ-C",
    extension: "m",
    paiza: "objective-c",
    local: false,
  },
  {
    id: "coffeescript",
    label: "CoffeeScript",
    short: "COFFEE",
    extension: "coffee",
    paiza: "coffeescript",
    local: false,
  },
  {
    id: "cobol",
    label: "COBOL",
    short: "COBOL",
    extension: "cob",
    paiza: "cobol",
    local: false,
  },
  {
    id: "powershell",
    label: "PowerShell",
    short: "PS",
    extension: "ps1",
    paiza: "powershell",
    local: false,
  },
  {
    id: "lua",
    label: "Lua",
    short: "LUA",
    extension: "lua",
    paiza: "lua",
    local: false,
  },
];

const BY_ID = new Map<string, RunnerLanguage>(
  RUNNER_LANGUAGES.map(
    (language): [string, RunnerLanguage] => [language.id, language],
  ),
);

const BY_EXTENSION = new Map<string, LanguageId>(
  RUNNER_LANGUAGES.map(
    (language): [string, LanguageId] => [language.extension, language.id],
  ),
);

// Common aliases that do not map 1:1 to the visible extension.
BY_EXTENSION.set("mjs", "javascript");
BY_EXTENSION.set("cjs", "javascript");
BY_EXTENSION.set("mts", "typescript");
BY_EXTENSION.set("cts", "typescript");
BY_EXTENSION.set("jsx", "javascript");
BY_EXTENSION.set("py3", "python");
BY_EXTENSION.set("cc", "cpp");
BY_EXTENSION.set("cxx", "cpp");
BY_EXTENSION.set("hpp", "cpp");
BY_EXTENSION.set("csx", "csharp");
BY_EXTENSION.set("bash", "bash");
BY_EXTENSION.set("zsh", "bash");
BY_EXTENSION.set("mysql", "sql");
BY_EXTENSION.set("cl", "commonlisp");
BY_EXTENSION.set("lsp", "commonlisp");
BY_EXTENSION.set("mm", "objectivec");
BY_EXTENSION.set("ps1", "powershell");
BY_EXTENSION.set("psm1", "powershell");

export const DEFAULT_LANGUAGE: LanguageId = "javascript";

export function isLanguageId(id: string): id is LanguageId {
  return BY_ID.has(id);
}

export function findLanguage(id: string | null | undefined): RunnerLanguage {
  if (!id) return BY_ID.get(DEFAULT_LANGUAGE)!;
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_LANGUAGE)!;
}

export function languageIdFromFilename(
  filename: string,
): LanguageId | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  if (!match) return null;
  return BY_EXTENSION.get(match[1].toLowerCase()) ?? null;
}

export function isAnalyzerLanguage(id: string): boolean {
  return id === "javascript" || id === "typescript" || id === "tsx";
}

export function isLocalSandboxLanguage(id: string): boolean {
  return findLanguage(id).local;
}

// ── Language signature detection (sandbox pre-flight) ───────

/**
 * One signature: a pattern that, when present anywhere in the artifact, adds
 * `weight` to that language's score. Presence counts once; repeats do not add.
 * Patterns are mostly line-anchored (`m` flag) so a keyword inside a string
 * or comment on another language's line rarely triggers them.
 */
type Signature = readonly [LanguageId, RegExp, number];

const SIGNATURES: readonly Signature[] = [
  // Python
  ["python", /^\s*(async\s+)?def\s+\w+\s*\([^)]*\)\s*(->\s*[^:]+)?:\s*(#.*)?$/m, 3],
  ["python", /^\s*(if|elif|else|for|while|with|try|except|finally|class)\b[^{};]*:\s*(#.*)?$/m, 2],
  ["python", /__name__\s*==\s*["']__main__["']/, 3],
  ["python", /^\s*from\s+[\w.]+\s+import\s+[\w*]/m, 2],
  ["python", /^\s*import\s+[\w.]+(\s+as\s+\w+)?\s*$/m, 1],
  ["python", /^\s*print\s*\([^;]*\)\s*$/m, 1],
  ["python", /\bself\.\w+/, 1],
  ["python", /\b(None|True|False)\b/, 1],

  // JavaScript (TypeScript-only signatures are below)
  ["javascript", /^\s*(export\s+)?(const|let|var)\s+[\w${[]/m, 2],
  ["javascript", /\bfunction\b\s*\*?\s*[\w$]*\s*\(/, 2],
  ["javascript", /=>/, 2],
  ["javascript", /\bconsole\.(log|error|warn|info|debug)\s*\(/, 3],
  ["javascript", /\b(require\s*\(|module\.exports|document\.|window\.)/, 2],
  ["javascript", /^\s*import\s.+\sfrom\s+["']/m, 3],
  ["javascript", /===|!==/, 2],

  // TypeScript
  ["typescript", /:\s*(string|number|boolean|void|unknown|never|any)\b(\[\])?\s*[,)=;{]/, 2],
  ["typescript", /^\s*(export\s+)?(interface|type|enum)\s+\w+(<[^>]*>)?\s*(=|\{)/m, 3],
  ["typescript", /\bas\s+(const|string|number|unknown)\b/, 2],
  ["typescript", /\b(private|public|readonly|protected)\s+\w+\s*[:(]/, 2],

  // C / C++ / Objective-C
  ["c", /^\s*#include\s*<(stdio|stdlib|string|math|stdbool|stdint|ctype|time|assert|limits)\.h>/m, 4],
  ["c", /\b(printf|scanf|malloc|free)\s*\(/, 2],
  ["c", /\bint\s+main\s*\(/, 2],
  ["cpp", /^\s*#include\s*<(iostream|vector|string|map|set|algorithm|memory|bits\/stdc\+\+\.h|unordered_map|sstream|fstream|cstdio|cstdlib)>/m, 4],
  ["cpp", /\bstd::/, 3],
  ["cpp", /\busing\s+namespace\s+std\b/, 4],
  ["cpp", /\b(cout|cerr)\s*<<|\bcin\s*>>/, 3],
  ["objectivec", /^\s*#import\s*[<"]/m, 4],
  ["objectivec", /@(interface|implementation|autoreleasepool|property)\b/, 3],
  ["objectivec", /\bNSLog\s*\(/, 3],

  // JVM / .NET
  ["java", /\bSystem\.out\.print/, 4],
  ["java", /\bpublic\s+static\s+void\s+main\s*\(\s*String/, 4],
  ["java", /^\s*import\s+java\./m, 4],
  ["java", /^\s*package\s+[\w.]+\s*;/m, 2],
  ["java", /\bpublic\s+(final\s+|abstract\s+)?class\s+\w+/, 2],
  ["csharp", /\bConsole\.(Write|WriteLine|ReadLine)\s*\(/, 4],
  ["csharp", /^\s*using\s+System(\.\w+)*\s*;/m, 4],
  ["csharp", /\bstatic\s+(async\s+)?(void|int|Task)\s+Main\s*\(/, 4],
  ["kotlin", /\bfun\s+\w+\s*\(/, 4],
  ["kotlin", /^\s*val\s+\w+/m, 2],
  ["scala", /^\s*object\s+\w+/m, 3],
  ["scala", /\bextends\s+App\b/, 4],
  ["scala", /\bdef\s+main\s*\(\s*args\s*:\s*Array\[String\]\s*\)/, 4],
  ["scala", /\bdef\s+\w+\s*(\[[^\]]*\])?\s*\([^)]*\)\s*(:\s*[\w[\]]+)?\s*=\s/, 3],
  ["fsharp", /\bprintfn\b/, 4],
  ["vb", /^\s*Module\s+\w+/m, 4],
  ["vb", /^\s*(Public\s+|Private\s+)?(Sub|Function)\s+\w+/m, 3],
  ["vb", /\bDim\s+\w+\s+As\b/, 4],

  // Systems
  ["go", /^\s*package\s+\w+\s*$/m, 3],
  ["go", /\bfmt\.(Print|Sprint|Fprint|Errorf)/, 4],
  ["go", /^\s*import\s+(\(|")/m, 3],
  ["go", /^\s*func\s+(\([^)]*\)\s*)?\w+\s*\(/m, 2],
  ["go", /:=/, 2],
  ["rust", /\bfn\s+\w+\s*(<[^>]*>)?\s*\(/, 3],
  ["rust", /\b(println|format|vec|panic)!\s*[([]/, 4],
  ["rust", /\blet\s+mut\b/, 3],
  ["rust", /\buse\s+std::|\bimpl\b/, 3],
  ["swift", /^\s*import\s+(Foundation|UIKit|SwiftUI|Swift)\s*$/m, 4],
  ["swift", /\bfunc\s+\w+\s*\([^)]*\)\s*->/, 2],
  ["swift", /\bguard\s+let\b/, 3],
  ["d", /^\s*import\s+std\.\w+\s*;/m, 5],
  ["d", /\bwriteln\s*\(/, 3],

  // Scripting
  ["ruby", /^\s*def\s+\w+[?!]?(\s*\([^)]*\))?\s*$/m, 2],
  ["ruby", /^\s*end\s*$/m, 2],
  ["ruby", /^\s*puts\b/m, 3],
  ["ruby", /\bdo\s*\|\w+(,\s*\w+)*\|/, 3],
  ["ruby", /^\s*require\s+["']/m, 2],
  ["ruby", /\battr_(reader|writer|accessor)\b/, 3],
  ["elixir", /^\s*defmodule\s+[A-Z]/m, 5],
  ["elixir", /\bIO\.(puts|inspect)\b/, 4],
  ["elixir", /\|>/, 2],
  ["php", /<\?php/, 5],
  ["php", /\$this->|\becho\s+\$/, 3],
  ["perl", /^\s*use\s+(strict|warnings)\s*;/m, 5],
  ["perl", /\bmy\s+[$@%]\w+/, 4],
  ["bash", /^#!.*\b(ba|z|da)?sh\b/, 5],
  ["bash", /^\s*(if|while)\s+\[\[?\s/m, 3],
  ["bash", /^\s*(fi|done|esac)\s*$/m, 3],
  ["bash", /^\s*echo\s/m, 2],
  ["python", /^#!.*\bpython/, 5],
  ["javascript", /^#!.*\bnode\b/, 5],
  ["r", /\b\w+\s*<-\s*(c\(|function\s*\(|\w)/, 3],
  ["r", /\blibrary\s*\(/, 4],
  ["haskell", /^\s*main\s*::\s*IO\b/m, 5],
  ["haskell", /^\s*\w+\s*::\s*[A-Z[(]/m, 3],
  ["haskell", /\bputStrLn\b/, 4],
  ["sql", /^\s*(SELECT\s+[\w*]|INSERT\s+INTO|CREATE\s+TABLE|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/im, 4],
  ["scheme", /^\s*\(define\s/m, 4],
  ["scheme", /\(display\s/, 3],
  ["commonlisp", /^\s*\(defun\s/m, 4],
  ["commonlisp", /\(format\s+t\s/, 3],
  ["coffeescript", /^\s*\w+\s*=\s*(\([^)]*\)\s*)?->/m, 4],
  ["cobol", /\b(IDENTIFICATION|PROCEDURE)\s+DIVISION\b/i, 5],
];

/** Minimum score before a detection is trusted enough to block a run. */
export const DETECTION_MIN_SCORE = 4;

/**
 * Runtimes that can still run code detected as a given language. Anything not
 * listed only accepts itself.
 */
const COMPATIBLE: Partial<Record<LanguageId, readonly LanguageId[]>> = {
  javascript: ["javascript", "typescript", "tsx"],
  typescript: ["typescript", "tsx"],
  c: ["c", "cpp", "objectivec"],
};

export interface LanguageDetection {
  id: LanguageId;
  label: string;
  score: number;
  /** Score of the second-best language (0 when none). */
  runnerUp: number;
  scores: Partial<Record<LanguageId, number>>;
}

/**
 * Lightweight signature heuristic. Returns the most likely language, or
 * `null` when no signature matched. It is a guess, not a parser: callers
 * should only act on it when `score >= DETECTION_MIN_SCORE`.
 */
export function detectCodeLanguage(code: string): LanguageDetection | null {
  const source = code.replace(/\r\n?/g, "\n");
  if (source.trim().length === 0) return null;

  const scores: Partial<Record<LanguageId, number>> = {};
  for (const [id, pattern, weight] of SIGNATURES) {
    if (pattern.test(source)) scores[id] = (scores[id] ?? 0) + weight;
  }

  // TypeScript is a JavaScript superset: merge the family, then pick one.
  const js = scores.javascript ?? 0;
  const ts = scores.typescript ?? 0;
  if (js + ts > 0) {
    if (ts >= 2) {
      scores.typescript = js + ts;
      delete scores.javascript;
    } else {
      scores.javascript = js + ts;
      delete scores.typescript;
    }
  }

  // C++ markers win over shared C signatures (`int main`, `printf`).
  const cpp = scores.cpp ?? 0;
  if (cpp >= 3 && scores.c) {
    scores.cpp = cpp + scores.c;
    delete scores.c;
  }

  const ranked = (Object.entries(scores) as Array<[LanguageId, number]>)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;

  const [id, score] = ranked[0];
  return {
    id,
    label: findLanguage(id).label,
    score,
    runnerUp: ranked[1]?.[1] ?? 0,
    scores,
  };
}

export type RuntimeMatch =
  | { ok: true; detected: LanguageDetection | null }
  | {
      ok: false;
      detected: LanguageDetection;
      selected: RunnerLanguage;
      message: string;
    };

/**
 * Pre-flight check before a sandbox run. Blocks only on a clear mismatch:
 * the detection is confident (≥ `DETECTION_MIN_SCORE`), beats the runner-up,
 * cannot run on the selected runtime, and the selected language itself scored
 * below 3. Everything else is allowed through.
 */
export function checkRuntimeMatch(
  code: string,
  selectedId: string,
): RuntimeMatch {
  const detected = detectCodeLanguage(code);
  const selected = findLanguage(selectedId);
  if (!detected) return { ok: true, detected };

  const allowed = COMPATIBLE[detected.id] ?? [detected.id];
  const selectedScore = detected.scores[selected.id] ?? 0;
  const clear =
    detected.score >= DETECTION_MIN_SCORE &&
    detected.score > detected.runnerUp &&
    !allowed.includes(selected.id) &&
    selectedScore < 3;

  if (!clear) return { ok: true, detected };

  return {
    ok: false,
    detected,
    selected,
    message: `⚠ Language Mismatch: Your code looks like ${detected.label}, but ${selected.label} is selected. Please switch the runtime selector next to the filename to ${detected.label} and run again.`,
  };
}
