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
  | "cobol";

export interface RunnerLanguage {
  id: LanguageId;
  label: string;
  short: string;
  extension: string;
  /** The language identifier accepted by the remote execution engine. */
  paiza: string;
  /** JavaScript can run inside the local 2-second Web Worker. */
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
    local: false,
    note: "TypeScript is compiled by the remote runner; type declarations are not executed as JavaScript.",
  },
  {
    id: "tsx",
    label: "TSX / React",
    short: "TSX",
    extension: "tsx",
    paiza: "typescript",
    local: false,
    note: "TSX is sent to the TypeScript compiler. JSX components may need a bundler or a plain TS reproduction.",
  },
  {
    id: "python",
    label: "Python 3",
    short: "PY",
    extension: "py",
    paiza: "python3",
    local: false,
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
    label: "SQL (MySQL)",
    short: "SQL",
    extension: "sql",
    paiza: "mysql",
    local: false,
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
