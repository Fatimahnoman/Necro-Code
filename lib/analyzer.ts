import type {
  AppliedFix,
  BugFinding,
  BugSeverity,
  ExorcismReport,
  ExorcismSummary,
} from "@/lib/types";

/**
 * A deterministic, dependency-free static "exorcist" for JS/TS snippets.
 * It never calls an external model: it hunts known curses with a masked
 * tokenizer + regex sigils, then applies safe counter-sigils to produce a
 * cleaner artifact. Everything runs server-side and survives Vercel builds.
 */

interface MaskResult {
  masked: string;
  unterminated: { index: number; quote: string } | null;
}

/** Replace string/template/comment bodies with spaces, preserving offsets. */
export function maskCode(code: string): MaskResult {
  const out = code.split("");
  let state:
    | "normal"
    | "single"
    | "double"
    | "template"
    | "line"
    | "block" = "normal";
  let quoteIndex = -1;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (state === "normal") {
      if (ch === "/" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i++;
        state = "line";
      } else if (ch === "/" && next === "*") {
        out[i] = " ";
        out[i + 1] = " ";
        i++;
        state = "block";
      } else if (ch === "'" || ch === '"' || ch === "`") {
        quoteIndex = i;
        out[i] = " ";
        state = ch === "'" ? "single" : ch === '"' ? "double" : "template";
      }
    } else if (state === "line") {
      if (ch === "\n") state = "normal";
      else out[i] = " ";
    } else if (state === "block") {
      out[i] = ch === "\n" ? "\n" : " ";
      if (ch === "*" && next === "/") {
        out[i + 1] = " ";
        i++;
        state = "normal";
      }
    } else {
      out[i] = ch === "\n" ? "\n" : " ";
      if (ch === "\\") {
        if (i + 1 < code.length) {
          out[i + 1] = code[i + 1] === "\n" ? "\n" : " ";
          i++;
        }
      } else if (
        (state === "single" && ch === "'") ||
        (state === "double" && ch === '"') ||
        (state === "template" && ch === "`")
      ) {
        state = "normal";
        quoteIndex = -1;
      }
    }
  }

  const unterminated =
    state === "single" || state === "double" || state === "template"
      ? { index: quoteIndex, quote: state }
      : null;

  return { masked: out.join(""), unterminated };
}

/** Strip comments but keep string literals intact (for string-aware rules). */
function maskComments(code: string): string {
  const out = code.split("");
  let state: "normal" | "single" | "double" | "template" | "line" | "block" =
    "normal";

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (state === "normal") {
      if (ch === "/" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i++;
        state = "line";
      } else if (ch === "/" && next === "*") {
        out[i] = " ";
        out[i + 1] = " ";
        i++;
        state = "block";
      } else if (ch === "'" || ch === '"' || ch === "`") {
        state = ch === "'" ? "single" : ch === '"' ? "double" : "template";
      }
    } else if (state === "line") {
      if (ch === "\n") state = "normal";
      else out[i] = " ";
    } else if (state === "block") {
      out[i] = ch === "\n" ? "\n" : " ";
      if (ch === "*" && next === "/") {
        out[i + 1] = " ";
        i++;
        state = "normal";
      }
    } else if (ch === "\\") {
      i++;
    } else if (
      (state === "single" && ch === "'") ||
      (state === "double" && ch === '"') ||
      (state === "template" && ch === "`")
    ) {
      state = "normal";
    }
  }

  return out.join("");
}

function lineColAt(code: string, index: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(index, code.length));
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < safe; i++) {
    if (code[i] === "\n") {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: safe - lastBreak };
}

function countLines(code: string): number {
  return code.length === 0 ? 0 : code.split("\n").length;
}

/**
 * True when the `while` at `index` is the tail of a `do { ... } while (...)`
 * statement. Rewriting that header to a `for` would produce invalid syntax, so
 * the infinite-loop counter-sigil must leave it alone.
 */
function isDoWhileTail(source: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;

  if (source[cursor] === "}") {
    let depth = 0;
    for (let i = cursor; i >= 0; i--) {
      if (source[i] === "}") depth++;
      else if (source[i] === "{") {
        depth--;
        if (depth === 0) {
          let head = i - 1;
          while (head >= 0 && /\s/.test(source[head])) head--;
          return /\bdo$/.test(source.slice(0, head + 1));
        }
      }
    }
    return false;
  }

  // Unbraced single-statement bodies: `do tick(); while (true)`.
  return /\bdo\b[^{};]*;\s*$/.test(source.slice(0, index));
}

type RuleSource = "code" | "commentMasked" | "raw";

interface RegexRule {
  id: string;
  title: string;
  severity: BugSeverity;
  pattern: RegExp;
  message: string;
  hint: string;
  fixable: boolean;
  source: RuleSource;
  filter?: (source: string, index: number) => boolean;
  transform?: (snippet: string, match: RegExpMatchArray) => string | null;
}

const RULES: RegexRule[] = [
  {
    id: "loose-equality",
    title: "Loose equality curse",
    severity: "warning",
    pattern: /(?<![=!<>])(?:==|!=)(?!=)/g,
    message: "Loose equality coerces types and hides logic parasites.",
    hint: "Replace == / != with === / !==.",
    fixable: true,
    source: "code",
    filter: (source, index) =>
      !/^\s*(?:null|undefined)\b/.test(source.slice(index + 2, index + 22)),
    transform: (_snippet, match) => (match[0] === "==" ? "===" : "!=="),
  },
  {
    id: "legacy-var",
    title: "Legacy var binding",
    severity: "info",
    pattern: /\bvar\b/g,
    message: "var leaks out of block scope and invites hoisting bugs.",
    hint: "Use let for mutable bindings and const for fixed ones.",
    fixable: true,
    source: "code",
    transform: () => "let",
  },
  {
    id: "debugger-residue",
    title: "Debugger trap",
    severity: "warning",
    pattern: /\bdebugger\s*;?/g,
    message: "A debugger statement freezes the living runtime.",
    hint: "Remove debugger before shipping.",
    fixable: true,
    source: "code",
    transform: () => "",
  },
  {
    id: "eval-invocation",
    title: "Forbidden eval()",
    severity: "critical",
    pattern: /\beval\s*\(/g,
    message: "eval() executes arbitrary strings — a demonic injection vector.",
    hint: "Replace eval with JSON.parse or an explicit parser.",
    fixable: false,
    source: "code",
  },
  {
    id: "parseint-radix",
    title: "Radix-less parseInt",
    severity: "warning",
    pattern: /\bparseInt\s*\(\s*[^,()]+?\s*\)/g,
    message: "parseInt without a radix may parse octal or hex by surprise.",
    hint: "Pass 10 as the second argument.",
    fixable: true,
    source: "code",
    transform: (snippet) => snippet.replace(/\)\s*$/, ", 10)"),
  },
  {
    id: "off-by-one-loop",
    title: "Off-by-one loop",
    severity: "critical",
    pattern: /for\s*\([^;]*;[^;]*?<=\s*[^;]*?\.length\s*;[^)]*\)/g,
    message: "i <= length reads one past the graveyard (undefined).",
    hint: "Use < instead of <= when comparing against .length.",
    fixable: true,
    source: "code",
    transform: (snippet) => snippet.replace(/<=/, "<"),
  },
  {
    id: "infinite-while",
    title: "Unbounded while loop",
    severity: "critical",
    pattern: /(?<![\w$.])while\s*\(\s*(?:true|1)\s*\)/g,
    message: "An unguarded while (true) loop can trap the ritual forever.",
    hint: "Bound the loop with a finite guard or break condition.",
    fixable: true,
    source: "code",
    filter: (source, index) => !isDoWhileTail(source, index),
    transform: () =>
      "for (let __necroLoopGuard = 0; __necroLoopGuard < 1000; __necroLoopGuard++)",
  },
  {
    id: "assignment-in-condition",
    title: "Assignment in condition",
    severity: "critical",
    pattern: /if\s*\(\s*[A-Za-z_$][\w$.]*\s*=\s*[^=][^)]*\)/g,
    message: "A single = inside if() assigns instead of compares.",
    hint: "Use === for comparison (or move the assignment out).",
    fixable: true,
    source: "code",
    transform: (snippet) => snippet.replace(/\s*=\s*/, " === "),
  },
  {
    id: "empty-catch",
    title: "Devoured error",
    severity: "warning",
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
    message: "An empty catch swallows the error forever.",
    hint: "Log or rethrow the captured error.",
    fixable: true,
    source: "code",
    transform: () =>
      'catch (err) { console.error("[exorcised]", err); }',
  },
  {
    id: "throw-string",
    title: "String thrown into the void",
    severity: "warning",
    pattern: /throw\s+(["'])(?:\\.|(?!\1)[^\\])*\1/g,
    message: "Throwing a string loses the stack trace.",
    hint: "Throw new Error(message) instead.",
    fixable: true,
    source: "commentMasked",
    transform: (snippet) =>
      snippet.replace(
        /^(\s*throw\s+)(["'])([\s\S]*)\2$/,
        "$1new Error($2$3$2)",
      ),
  },
  {
    id: "leaked-secret",
    title: "Leaked secret sigil",
    severity: "critical",
    pattern:
      /(?:api[_-]?key|secret|password|token)\s*[:=]\s*(["'])[^"']{6,}\1/gi,
    message: "A hardcoded credential bleeds through the veil.",
    hint: "Move secrets to environment variables.",
    fixable: true,
    source: "commentMasked",
    transform: (snippet) =>
      snippet.replace(/([:=]\s*)(["'])[^"']*\2/, '$1""'),
  },
  {
    id: "innerhtml-injection",
    title: "innerHTML possession",
    severity: "warning",
    pattern: /\.innerHTML\s*=/g,
    message: "innerHTML can execute injected markup (XSS).",
    hint: "Prefer textContent for plain text.",
    fixable: true,
    source: "code",
    transform: (snippet) => snippet.replace("innerHTML", "textContent"),
  },
  {
    id: "document-write",
    title: "document.write() ritual",
    severity: "critical",
    pattern: /document\.write(?:ln)?\s*\(/g,
    message: "document.write() can erase the living document.",
    hint: "Render through the framework instead.",
    fixable: false,
    source: "code",
  },
  {
    id: "with-statement",
    title: "Forbidden with()",
    severity: "critical",
    pattern: /\bwith\s*\(/g,
    message: "with() blurs scope and is forbidden in strict mode.",
    hint: "Destructure the object explicitly.",
    fixable: false,
    source: "code",
  },
  {
    id: "alert-ritual",
    title: "Blocking alert()",
    severity: "info",
    pattern: /\balert\s*\(/g,
    message: "alert() blocks the ritual thread.",
    hint: "Use an in-UI notification instead.",
    fixable: false,
    source: "code",
  },
  {
    id: "nan-comparison",
    title: "NaN comparison",
    severity: "warning",
    pattern:
      /(?:\bNaN\s*[=!]==?\s*[A-Za-z_$][\w$.]*|[A-Za-z_$][\w$.]*\s*[=!]==?\s*NaN\b)/g,
    message: "NaN never equals itself — this comparison is always false.",
    hint: "Use Number.isNaN(value).",
    fixable: true,
    source: "code",
    transform: (snippet) => {
      const match =
        /^\s*(?:([A-Za-z_$][\w$.]*)\s*([=!]==?)\s*NaN|NaN\s*([=!]==?)\s*([A-Za-z_$][\w$.]*))\s*$/.exec(
          snippet,
        );
      if (!match) return null;
      const operand = match[1] ?? match[4];
      const operator = match[2] ?? match[3];
      if (!operand || !operator) return null;
      const negated = operator.startsWith("!");
      return `${negated ? "!" : ""}Number.isNaN(${operand})`;
    },
  },
  {
    id: "undying-interval",
    title: "Undying interval",
    severity: "warning",
    pattern: /\bsetInterval\s*\(/g,
    message:
      "setInterval without clearInterval keeps the soul — and its memory — trapped forever.",
    hint: "Store the timer id and clear it when the component or ritual is torn down.",
    fixable: false,
    source: "code",
    filter: (source) => !/\bclearInterval\s*\(/.test(source),
  },
  {
    id: "cursed-marker",
    title: "Cursed TODO marker",
    severity: "info",
    pattern: /\b(?:TODO|FIXME|HACK)\b/g,
    message: "An unfinished ritual is marked in the crypt.",
    hint: "Resolve or ticket the marker.",
    fixable: false,
    source: "raw",
  },
];

function ruleSource(code: string, rule: RegexRule): string {
  if (rule.source === "raw") return code;
  if (rule.source === "commentMasked") return maskComments(code);
  return maskCode(code).masked;
}

function collect(rule: RegexRule, code: string): BugFinding[] {
  const source = ruleSource(code, rule);
  const findings: BugFinding[] = [];

  for (const match of source.matchAll(rule.pattern)) {
    const index = match.index ?? 0;
    if (rule.filter && !rule.filter(source, index)) continue;
    const { line, column } = lineColAt(code, index);
    findings.push({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      line,
      column,
      message: rule.message,
      hint: rule.hint,
      fixable: rule.fixable,
      snippet: code.slice(index, index + match[0].length),
    });
  }

  return findings;
}

function syntaxFindings(code: string): BugFinding[] {
  const { masked, unterminated } = maskCode(code);
  const findings: BugFinding[] = [];

  if (unterminated) {
    const { line, column } = lineColAt(code, unterminated.index);
    findings.push({
      id: "unterminated-string",
      title: "Unterminated string",
      severity: "critical",
      line,
      column,
      message: `A ${unterminated.quote} string never closes — the artifact leaks into the void.`,
      hint: "Close the quote or escape it.",
      fixable: false,
      snippet: code.split("\n")[line - 1]?.trim() ?? "",
    });
  }

  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: Array<{ char: string; index: number }> = [];

  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push({ char: ch, index: i });
    } else if (ch === ")" || ch === "]" || ch === "}") {
      const top = stack.pop();
      if (!top) {
        const { line, column } = lineColAt(code, i);
        findings.push({
          id: "stray-closer",
          title: "Stray closing bracket",
          severity: "critical",
          line,
          column,
          message: `A '${ch}' closes a circle that was never opened.`,
          hint: "Remove the extra bracket or open the matching one.",
          fixable: false,
          snippet: code.split("\n")[line - 1]?.trim() ?? "",
        });
      } else if (top.char !== pairs[ch]) {
        const { line, column } = lineColAt(code, i);
        findings.push({
          id: "mismatched-bracket",
          title: "Mismatched bracket",
          severity: "critical",
          line,
          column,
          message: `A '${ch}' tried to close a '${top.char}'.`,
          hint: "Balance the ritual brackets.",
          fixable: false,
          snippet: code.split("\n")[line - 1]?.trim() ?? "",
        });
      }
    }
  }

  for (const open of stack) {
    const { line, column } = lineColAt(code, open.index);
    const isCurly = open.char === "{";
    findings.push({
      id: "unclosed-bracket",
      title: isCurly ? "Unclosed code block" : "Unclosed bracket",
      severity: "critical",
      line,
      column,
      message: `A '${open.char}' was opened but never sealed.`,
      hint: isCurly
        ? "Seal the code block at the end of the snippet."
        : "Close the ritual bracket.",
      fixable: isCurly,
      snippet: code.split("\n")[line - 1]?.trim() ?? "",
    });
  }

  return findings;
}

/**
 * NOTE: `console.log` / `print` are intentional program output here, not debug
 * residue. Removing them made TEST SANDBOX / GEN TEST look empty, so the
 * analyzer deliberately leaves stdout calls untouched.
 */
export function analyzeCode(code: string): BugFinding[] {
  const findings: BugFinding[] = [
    ...syntaxFindings(code),
    ...RULES.flatMap((rule) => collect(rule, code)),
  ];

  const seen = new Set<string>();
  return findings
    .filter((f) => {
      const key = `${f.id}:${f.line}:${f.column}:${f.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line || a.column - b.column);
}

function applyRuleFix(code: string, rule: RegexRule): string {
  if (!rule.transform) return code;

  const source = ruleSource(code, rule);
  const matches = Array.from(source.matchAll(rule.pattern));
  let out = code;

  // Apply from the end so earlier offsets stay valid.
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const index = match.index ?? 0;
    if (rule.filter && !rule.filter(source, index)) continue;

    const snippet = code.slice(index, index + match[0].length);
    const replacement = rule.transform(snippet, match);
    if (replacement === null || replacement === snippet) continue;
    out = out.slice(0, index) + replacement + out.slice(index + snippet.length);
  }

  return out;
}

/**
 * Seal unclosed `{` blocks at the end of the artifact. Only curly braces are
 * auto-healed; unclosed `(` / `[` remain reported for human review.
 */
function closeUnclosedBraces(code: string): string {
  const { masked } = maskCode(code);
  const stack: string[] = [];

  for (const ch of masked) {
    if (ch === "{" || ch === "(" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === ")" || ch === "]") {
      stack.pop();
    }
  }

  const lowestBrace = stack.indexOf("{");
  if (lowestBrace === -1) return code;

  // Walk from the top of the stack down to the first unclosed brace. Every
  // added `}` pops one item, so this seals every open block even when another
  // unclosed bracket sits above it. Non-brace gaps stay reported for review.
  const closers = Array.from(
    { length: stack.length - lowestBrace },
    () => "}",
  ).join("\n");
  const trimmed = code.replace(/\s+$/, "");

  return `${trimmed}${trimmed.length > 0 ? "\n" : ""}${closers}`;
}

export function exorciseCode(input: string): ExorcismReport {
  const original = input.replace(/\r\n?/g, "\n");
  const findings = analyzeCode(original);

  let fixed = original;
  for (const rule of RULES) {
    fixed = applyRuleFix(fixed, rule);
  }
  fixed = closeUnclosedBraces(fixed);

  const remaining = analyzeCode(fixed);
  const detected = findings.length;
  const unresolved = remaining.length;

  const summary: ExorcismSummary = {
    detected,
    fixed: Math.max(0, detected - unresolved),
    unresolved,
    lines: countLines(original),
    chars: original.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  const appliedFixes: AppliedFix[] = findings
    .filter((f) => f.fixable)
    .map((f) => ({
      id: f.id,
      title: f.title,
      line: f.line,
      description: f.hint,
    }));

  return {
    original,
    fixed,
    findings,
    appliedFixes,
    remaining,
    summary,
  };
}
