/**
 * Tiny, dependency-free syntax highlighter for the Spellbook editor overlay.
 * One regex pass per render; recognises comments, strings, numbers, and
 * keywords per language family. It is decorative: it never changes the code,
 * and unknown syntax simply stays "plain".
 */

export type TokenKind = "plain" | "comment" | "string" | "keyword" | "number";

export interface Token {
  kind: TokenKind;
  text: string;
}

interface Family {
  line: string[];
  block?: [string, string];
  quotes: string[];
  /** Quote characters whose strings may span lines (template literals). */
  multiline?: string[];
  keywords: string[];
  caseInsensitive?: boolean;
}

const C_LIKE = [
  "abstract", "as", "async", "auto", "await", "bool", "boolean", "break", "case", "catch", "chan", "char",
  "class", "const", "continue", "def", "default", "defer", "delete", "do", "double", "echo", "else", "enum",
  "export", "extends", "false", "final", "finally", "float", "fn", "for", "from", "fun", "func", "function",
  "go", "if", "impl", "implements", "import", "in", "include", "instanceof", "int", "interface", "is", "let",
  "long", "loop", "map", "match", "mod", "mut", "namespace", "new", "nil", "null", "nullptr", "object", "of",
  "override", "package", "private", "protected", "pub", "public", "readonly", "return", "self", "short",
  "static", "string", "struct", "super", "switch", "template", "this", "throw", "throws", "trait", "true",
  "try", "type", "typedef", "typename", "typeof", "undefined", "unsigned", "use", "using", "val", "var",
  "virtual", "void", "when", "where", "while", "yield",
];

const FAMILIES: Record<string, Family> = {
  slash: {
    line: ["//"],
    block: ["/*", "*/"],
    quotes: ['"', "'", "`"],
    multiline: ["`"],
    keywords: C_LIKE,
  },
  hash: {
    line: ["#"],
    quotes: ['"', "'"],
    keywords: [
      "and", "as", "assert", "async", "await", "begin", "break", "case", "class", "continue", "def", "defmodule",
      "del", "do", "done", "elif", "else", "elsif", "end", "ensure", "esac", "except", "export", "False", "fi",
      "finally", "for", "from", "function", "global", "if", "import", "in", "is", "lambda", "local", "module",
      "my", "nil", "None", "nonlocal", "not", "or", "pass", "print", "puts", "raise", "require", "rescue",
      "return", "self", "sub", "then", "True", "try", "unless", "until", "use", "while", "with", "yield",
    ],
  },
  dash: {
    line: ["--"],
    block: ["{-", "-}"],
    quotes: ['"', "'"],
    caseInsensitive: true,
    keywords: [
      "and", "as", "asc", "by", "case", "class", "create", "data", "delete", "desc", "distinct", "do", "drop",
      "else", "from", "group", "having", "if", "import", "in", "insert", "instance", "into", "is", "join", "key",
      "let", "limit", "module", "not", "null", "of", "on", "or", "order", "primary", "select", "set", "table",
      "then", "update", "values", "where", "with",
    ],
  },
  semi: {
    line: [";"],
    quotes: ['"'],
    keywords: ["cond", "define", "defun", "defvar", "if", "lambda", "let", "loop", "nil", "quote", "setq", "t"],
  },
  vb: {
    line: ["'"],
    quotes: ['"'],
    caseInsensitive: true,
    keywords: [
      "and", "as", "byval", "class", "dim", "else", "end", "false", "for", "function", "if", "imports", "integer",
      "module", "new", "next", "not", "nothing", "or", "private", "public", "return", "string", "sub", "then",
      "true", "while",
    ],
  },
};

const FAMILY_BY_LANGUAGE: Record<string, keyof typeof FAMILIES> = {
  python: "hash",
  ruby: "hash",
  perl: "hash",
  r: "hash",
  bash: "hash",
  elixir: "hash",
  coffeescript: "hash",
  sql: "dash",
  haskell: "dash",
  scheme: "semi",
  commonlisp: "semi",
  vb: "vb",
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

interface Compiled {
  pattern: RegExp;
  keywords: Set<string>;
  caseInsensitive: boolean;
}

const cache = new Map<string, Compiled>();

function compile(familyId: keyof typeof FAMILIES): Compiled {
  const cached = cache.get(familyId);
  if (cached) return cached;
  const family = FAMILIES[familyId];
  const comments: string[] = [];
  if (family.block) {
    comments.push(`${escape(family.block[0])}[\\s\\S]*?(?:${escape(family.block[1])}|$)`);
  }
  comments.push(`(?:${family.line.map(escape).join("|")})[^\\n]*`);
  const strings = family.quotes.map((quote) => {
    const q = escape(quote);
    const newline = family.multiline?.includes(quote) ? "" : "\\n";
    return `${q}(?:[^${q}\\\\${newline}]|\\\\.)*${q}?`;
  });
  const source = [
    `(${comments.join("|")})`,
    `(${strings.join("|")})`,
    `(\\b0[xX][\\da-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)`,
    `([A-Za-z_$][\\w$]*)`,
  ].join("|");
  const compiled: Compiled = {
    pattern: new RegExp(source, "g"),
    keywords: new Set(
      family.caseInsensitive ? family.keywords.map((word) => word.toLowerCase()) : family.keywords,
    ),
    caseInsensitive: family.caseInsensitive ?? false,
  };
  cache.set(familyId, compiled);
  return compiled;
}

/** Split `code` into highlighted tokens for `languageId` (a `LanguageId`). */
export function highlightCode(code: string, languageId: string): Token[] {
  if (languageId === "cobol") return [{ kind: "plain", text: code }];
  const { pattern, keywords, caseInsensitive } = compile(FAMILY_BY_LANGUAGE[languageId] ?? "slash");
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    if (text.length === 0) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ kind, text });
  };

  pattern.lastIndex = 0;
  let cursor = 0;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    push("plain", code.slice(cursor, match.index));
    const [text, comment, string, number, word] = match;
    if (comment !== undefined) push("comment", text);
    else if (string !== undefined) push("string", text);
    else if (number !== undefined) push("number", text);
    else if (word !== undefined) {
      push(keywords.has(caseInsensitive ? word.toLowerCase() : word) ? "keyword" : "plain", text);
    } else push("plain", text);
    cursor = match.index + text.length;
    if (text.length === 0) pattern.lastIndex += 1;
  }
  push("plain", code.slice(cursor));
  return tokens;
}
