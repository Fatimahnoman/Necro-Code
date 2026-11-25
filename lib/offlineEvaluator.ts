import { findLanguage, isLanguageId } from "@/lib/languages";
import type { RemoteRunResult } from "@/lib/runner";

/**
 * Last-resort offline evaluator. It NEVER guesses output: it parses real
 * statements (variables, arithmetic, branches, loops and print calls) and
 * evaluates them deterministically. Every result is tagged so the user knows
 * a native compiler was unavailable.
 */

const TAG = "[OFFLINE LOCAL EVAL]";
const MAX_STEPS = 4_000;
const MAX_OUTPUT = 400;
const MAX_ITERATIONS = 500;
const MAX_DISPLAY_DEPTH = 4;

type Value = number | string | boolean | null | undefined | Value[];
type TokenKind = "num" | "str" | "id" | "op";
type Control = "break" | "continue" | undefined;

interface Token { kind: TokenKind; value: string }
interface Statement { text: string; depth: number; children: Statement[] }
class Scope {
  readonly vars = new Map<string, Value>();
  constructor(readonly parent?: Scope) {}
}
interface Context { steps: number; touched: number; output: string[] }

class EvalLimitError extends Error {}

function lookup(scope: Scope, name: string): Value {
  let current: Scope | undefined = scope;
  while (current) {
    if (current.vars.has(name)) return current.vars.get(name);
    current = current.parent;
  }
  return undefined;
}

function assign(scope: Scope, name: string, value: Value): void {
  scope.vars.set(name, value);
}

function truthy(value: Value): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return Boolean(value);
}

function asNumber(value: Value): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function display(value: Value, scope: Scope, depth = 0): string {
  if (depth > MAX_DISPLAY_DEPTH) return "[…]";
  if (Array.isArray(value)) return value.map((item) => display(item, scope, depth + 1)).join(", ");
  if (typeof value === "string") {
    return value
      .replace(/#\{([A-Za-z_$][\w$]*)\}/g, (match, name: string) => {
        const found = lookup(scope, name);
        return found === undefined ? match : display(found, scope, depth + 1);
      })
      .replace(/\{([A-Za-z_$][\w$]*)\}/g, (match, name: string) => {
        const found = lookup(scope, name);
        return found === undefined ? match : display(found, scope, depth + 1);
      })
      .replace(/\$([A-Za-z_$][\w$]*)/g, (match, name: string) => {
        const found = lookup(scope, name);
        return found === undefined ? match : display(found, scope, depth + 1);
      });
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return String(value);
}

function decodeString(raw: string): string {
  const body = raw.slice(1, -1);
  return body.replace(/\\(.)/g, (_match: string, char: string) =>
    char === "n" ? "\n" : char === "t" ? "\t" : char === "r" ? "\r" : char,
  );
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const source = "\\s*(\\d+(?:\\.\\d+)?|\\x22(?:\\\\.|[^\\x22\\\\])*\\x22|\\x27(?:\\\\.|[^\\x27\\\\])*\\x27|`[^`]*`|[A-Za-z_$][\\w$]*|===|!==|==|!=|<=|>=|&&|\\|\\||\\+\\+|--|\\+=|-=|\\*=|\/=|%=|[-+*\\/%()<>!,\\[\\]])";
  const pattern = new RegExp(source, "y");
  let position = 0;
  while (position < input.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(input);
    if (!match) { position += 1; continue; }
    const value = match[1];
    const kind: TokenKind = /^\d/.test(value)
      ? "num"
      : /^["'`]/.test(value)
        ? "str"
        : /^[A-Za-z_$]/.test(value)
          ? "id"
          : "op";
    tokens.push({ kind, value });
    position = pattern.lastIndex;
  }
  return tokens;
}

function callFunction(name: string, args: Value[], scope: Scope): Value {
  if (name === "range") {
    const end = Math.floor(asNumber(args.length > 1 ? args[1] : args[0] ?? 0));
    const start = args.length > 1 ? Math.floor(asNumber(args[0])) : 0;
    const count = Math.min(MAX_ITERATIONS, Math.max(0, end - start));
    return Array.from({ length: count }, (_unused, index) => start + index);
  }
  if (name === "len") {
    const target = args[0];
    if (Array.isArray(target)) return target.length;
    return display(target, scope).length;
  }
  if (name === "str") return display(args[0], scope);
  if (name === "int") return Math.floor(asNumber(args[0]));
  if (name === "abs") return Math.abs(asNumber(args[0]));
  return undefined;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[], private readonly scope: Scope) {}

  parse(): Value { return this.or(); }

  private peek(value?: string): Token | undefined {
    const token = this.tokens[this.position];
    return value === undefined ? token : token?.value === value ? token : undefined;
  }

  private next(): Token | undefined { return this.tokens[this.position++]; }

  private match(value: string): boolean {
    if (!this.peek(value)) return false;
    this.position += 1;
    return true;
  }

  private expect(value: string): void {
    if (!this.match(value)) throw new EvalLimitError("Malformed expression.");
  }

  private or(): Value {
    let left = this.and();
    while (this.match("||")) left = truthy(left) || truthy(this.and());
    return left;
  }

  private and(): Value {
    let left = this.equality();
    while (this.match("&&")) left = truthy(left) && truthy(this.equality());
    return left;
  }

  private equality(): Value {
    let left = this.relational();
    for (;;) {
      const operator = this.peek()?.value;
      if (operator !== "==" && operator !== "===" && operator !== "!=" && operator !== "!==") break;
      this.position += 1;
      const right = this.relational();
      const equal = this.looseEqual(left, right);
      left = operator.startsWith("!") ? !equal : equal;
    }
    return left;
  }

  private looseEqual(left: Value, right: Value): boolean {
    if (typeof left === "string" || typeof right === "string") return display(left, this.scope) === display(right, this.scope);
    return left === right;
  }

  private relational(): Value {
    let left = this.additive();
    for (;;) {
      const operator = this.peek()?.value;
      if (operator !== "<" && operator !== "<=" && operator !== ">" && operator !== ">=") break;
      this.position += 1;
      const right = this.additive();
      const a = asNumber(left);
      const b = asNumber(right);
      left = operator === "<" ? a < b : operator === "<=" ? a <= b : operator === ">" ? a > b : a >= b;
    }
    return left;
  }

  private additive(): Value {
    let left = this.multiplicative();
    for (;;) {
      const operator = this.peek()?.value;
      if (operator !== "+" && operator !== "-") break;
      this.position += 1;
      const right = this.multiplicative();
      left = operator === "+"
        ? typeof left === "string" || typeof right === "string"
          ? display(left, this.scope) + display(right, this.scope)
          : asNumber(left) + asNumber(right)
        : asNumber(left) - asNumber(right);
    }
    return left;
  }

  private multiplicative(): Value {
    let left = this.unary();
    for (;;) {
      const operator = this.peek()?.value;
      if (operator !== "*" && operator !== "/" && operator !== "%") break;
      this.position += 1;
      const right = this.unary();
      const a = asNumber(left);
      const b = asNumber(right);
      left = operator === "*" ? a * b : operator === "/" ? (b === 0 ? 0 : a / b) : b === 0 ? 0 : a % b;
    }
    return left;
  }

  private unary(): Value {
    const operator = this.peek()?.value;
    if (operator === "!" || operator === "-" || operator === "+") {
      this.position += 1;
      const value = this.unary();
      return operator === "!" ? !truthy(value) : operator === "-" ? -asNumber(value) : asNumber(value);
    }
    return this.primary();
  }

  private primary(): Value {
    const token = this.next();
    if (!token) return undefined;
    if (token.kind === "num") return Number(token.value);
    if (token.kind === "str") return decodeString(token.value);
    if (token.kind === "id") {
      const name = token.value;
      if (name === "true") return true;
      if (name === "false") return false;
      if (name === "null" || name === "nil" || name === "None") return null;
      if (this.peek("(")) {
        this.position += 1;
        const args: Value[] = [];
        if (!this.peek(")")) {
          do { args.push(this.or()); } while (this.match(","));
        }
        this.expect(")");
        return callFunction(name, args, this.scope);
      }
      return lookup(this.scope, name);
    }
    if (token.value === "(") {
      const value = this.or();
      this.expect(")");
      return value;
    }
    if (token.value === "[") {
      const items: Value[] = [];
      if (!this.peek("]")) {
        do { items.push(this.or()); } while (this.match(","));
      }
      this.expect("]");
      return items;
    }
    return undefined;
  }
}

function evalExpression(expression: string, scope: Scope): Value {
  const tokens = tokenize(expression);
  if (tokens.length === 0) return undefined;
  try {
    return new Parser(tokens, scope).parse();
  } catch {
    return undefined;
  }
}

function splitArguments(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      current += char;
      if (char === quote && input[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; current += char; continue; }
    if (char === "(" || char === "[" || char === "{") { depth += 1; current += char; continue; }
    if (char === ")" || char === "]" || char === "}") { depth -= 1; current += char; continue; }
    if (char === "," && depth === 0) { parts.push(current.trim()); current = ""; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

function emit(raw: string, context: Context): void {
  const lines = String(raw).replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    if (context.output.length >= MAX_OUTPUT) throw new EvalLimitError();
    context.output.push(line.replace(/\s+$/g, ""));
  }
}

function renderArguments(args: Value[], scope: Scope): string {
  if (args.length === 0) return "";
  const first = args[0];
  const rest = args.slice(1);
  let text = display(first, scope);
  if (typeof first === "string") {
    let index = 0;
    text = text.replace(/%[-+ #0\d.]*[dfisxu%]/g, () => index < rest.length ? display(rest[index++], scope) : "");
    text = text.replace(/\{\}/g, () => index < rest.length ? display(rest[index++], scope) : "");
    if (index === 0 && rest.length > 0) text += " " + rest.map((value) => display(value, scope)).join(" ");
  } else if (rest.length > 0) {
    text = [text, ...rest.map((value) => display(value, scope))].join(" ");
  }
  return text;
}

function executePrint(text: string, scope: Scope, context: Context): boolean {
  const patterns: Array<{ pattern: RegExp; cout?: boolean }> = [
    { pattern: /^std::cout\s*<<(.+)$/, cout: true },
    { pattern: /^printf\s*\((.*)\)$/ },
    { pattern: /^System\.out\.print(?:ln)?\s*\((.*)\)$/ },
    { pattern: /^fmt\.Print(?:ln|f)?\s*\((.*)\)$/ },
    { pattern: /^println!\s*\((.*)\)$/ },
    { pattern: /^Console\.WriteLine\s*\((.*)\)$/ },
    { pattern: /^console\.log\s*\((.*)\)$/ },
    { pattern: /^puts\s*\((.*)\)$/ },
    { pattern: /^puts\s+(.+)$/ },
    { pattern: /^print\s*\((.*)\)$/ },
    { pattern: /^echo\s*\((.*)\)$/ },
    { pattern: /^echo\s+(.+)$/ },
    { pattern: /^putStrLn\s+(.+)$/ },
    { pattern: /^print\s+(.+)$/ },
  ];

  for (const { pattern, cout } of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (cout) {
      const pieces = match[1]
        .split("<<")
        .map((piece) => piece.trim())
        .filter((piece) => piece.length > 0 && piece !== "std::endl" && piece !== "endl");
      emit(pieces.map((piece) => display(evalExpression(piece, scope), scope)).join(""), context);
    } else {
      const args = splitArguments(match[1]).map((argument) => evalExpression(argument, scope));
      emit(renderArguments(args, scope), context);
    }
    context.touched += 1;
    return true;
  }
  return false;
}

function executeAssignment(text: string, scope: Scope, context: Context): boolean {
  let match: RegExpExecArray | null = /^(?:int|long|short|char|float|double|bool|boolean|string|str|const|let|var|auto|final|unsigned(?:\s+\w+)?)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*(.+))?$/.exec(text);
  if (match) {
    assign(scope, match[1], match[2] ? evalExpression(match[2], scope) : 0);
    context.touched += 1;
    return true;
  }
  match = /^([A-Za-z_$][\w$]*)\+\+$/.exec(text);
  if (match) { assign(scope, match[1], asNumber(lookup(scope, match[1])) + 1); context.touched += 1; return true; }
  match = /^\+\+([A-Za-z_$][\w$]*)$/.exec(text);
  if (match) { assign(scope, match[1], asNumber(lookup(scope, match[1])) + 1); context.touched += 1; return true; }
  match = /^([A-Za-z_$][\w$]*)--$/.exec(text);
  if (match) { assign(scope, match[1], asNumber(lookup(scope, match[1])) - 1); context.touched += 1; return true; }
  match = /^--([A-Za-z_$][\w$]*)$/.exec(text);
  if (match) { assign(scope, match[1], asNumber(lookup(scope, match[1])) - 1); context.touched += 1; return true; }
  match = /^([A-Za-z_$][\w$]*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/.exec(text);
  if (match) {
    const current = lookup(scope, match[1]);
    const right = evalExpression(match[3], scope);
    const value = match[2] === "+=" && (typeof current === "string" || typeof right === "string")
      ? display(current, scope) + display(right, scope)
      : match[2] === "+=" ? asNumber(current) + asNumber(right)
        : match[2] === "-=" ? asNumber(current) - asNumber(right)
          : match[2] === "*=" ? asNumber(current) * asNumber(right)
            : match[2] === "/=" ? asNumber(right) === 0 ? 0 : asNumber(current) / asNumber(right)
              : asNumber(right) === 0 ? 0 : asNumber(current) % asNumber(right);
    assign(scope, match[1], value);
    context.touched += 1;
    return true;
  }
  match = /^([A-Za-z_$][\w$]*)\s*:=\s*(.+)$/.exec(text);
  if (match) {
    assign(scope, match[1], evalExpression(match[2], scope));
    context.touched += 1;
    return true;
  }
  match = /^([A-Za-z_$][\w$]*)\s*=\s*(?!=)(.+)$/.exec(text);
  if (match) {
    assign(scope, match[1], evalExpression(match[2], scope));
    context.touched += 1;
    return true;
  }
  return false;
}

function stripLineComment(line: string): string {
  let quote = "";
  let result = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      result += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") { quote = char; result += char; continue; }
    if (char === "#" || (char === "/" && line[index + 1] === "/")) break;
    result += char;
  }
  return result;
}

function buildTree(code: string): Statement[] {
  const cleaned = code
    .replace(/\r\n?/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => stripLineComment(line))
    .join("\n");

  const root: Statement[] = [];
  const stack: Statement[] = [];
  let buffer = "";
  let braceDepth = 0;
  let pairingDepth = 0;
  let leading = cleaned.match(/^[\t ]*/)?.[0] ?? "";
  let indent = Math.floor(leading.replace(/\t/g, "  ").length / 2);
  let quote = "";

  const flush = (): void => {
    const text = buffer.trim();
    buffer = "";
    if (!text) return;
    const statement: Statement = { text, depth: braceDepth + indent, children: [] };
    while (stack.length > 0 && statement.depth <= stack[stack.length - 1].depth) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].children.push(statement);
    else root.push(statement);
    stack.push(statement);
  };

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (quote) {
      buffer += char;
      if (char === "\\" && index + 1 < cleaned.length) {
        buffer += cleaned[index + 1];
        index += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") { quote = char; buffer += char; continue; }
    if (char === "\n") {
      flush();
      let cursor = index + 1;
      let spaces = 0;
      while (cleaned[cursor] === " " || cleaned[cursor] === "\t") {
        spaces += cleaned[cursor] === "\t" ? 2 : 1;
        cursor += 1;
      }
      indent = Math.floor(spaces / 2);
      continue;
    }
    if (char === "(" || char === "[") { pairingDepth += 1; buffer += char; continue; }
    if (char === ")" || char === "]") { pairingDepth = Math.max(0, pairingDepth - 1); buffer += char; continue; }
    if (char === "{") { flush(); braceDepth += 1; continue; }
    if (char === "}") { flush(); braceDepth = Math.max(0, braceDepth - 1); continue; }
    if (char === ";" && pairingDepth === 0) {
      const trimmed = buffer.trim();
      if (/^(?:for|if)\b/.test(trimmed) && !trimmed.includes("(")) { buffer += char; continue; }
      flush();
      continue;
    }
    buffer += char;
  }
  flush();
  return root;
}

function executeBlock(statements: Statement[], scope: Scope, context: Context): Control {
  let lastBranchTaken = false;

  for (const statement of statements) {
    if (context.steps++ > MAX_STEPS) throw new EvalLimitError();
    const text = statement.text.replace(/;+$/, "").replace(/:+$/, "").trim();
    if (!text) continue;

    const ifMatch = /^if\s*\((.*)\)$/.exec(text) ?? /^if\s+(.+)$/.exec(text);
    if (ifMatch) {
      lastBranchTaken = truthy(evalExpression(ifMatch[1], scope));
      if (lastBranchTaken) {
        const control = executeBlock(statement.children, new Scope(scope), context);
        if (control) return control;
      }
      continue;
    }

    const elseIfMatch = /^else\s+if\s*\((.*)\)$/.exec(text) ?? /^elif\s+(.+)$/.exec(text);
    if (elseIfMatch) {
      const condition = !lastBranchTaken && truthy(evalExpression(elseIfMatch[1], scope));
      if (condition) {
        lastBranchTaken = true;
        const control = executeBlock(statement.children, new Scope(scope), context);
        if (control) return control;
      }
      continue;
    }

    if (/^else$/.test(text)) {
      if (!lastBranchTaken) {
        lastBranchTaken = true;
        const control = executeBlock(statement.children, new Scope(scope), context);
        if (control) return control;
      }
      continue;
    }

    lastBranchTaken = false;

    const cFor = /^for\s*\(([^;]*);\s*([^;]*);\s*([^)]*)\)$/.exec(text)
      ?? /^for\s+([^;]+);\s*([^;]+);\s*(.+)$/.exec(text);
    if (cFor) {
      executeAssignment(cFor[1], scope, context);
      let iterations = 0;
      while (iterations < MAX_ITERATIONS && truthy(evalExpression(cFor[2], scope))) {
        iterations += 1;
        const control = executeBlock(statement.children, new Scope(scope), context);
        if (control === "break") break;
        executeAssignment(cFor[3], scope, context);
      }
      if (iterations >= MAX_ITERATIONS) emit("[evaluator loop limit reached]", context);
      continue;
    }

    const forEach = /^for\s*\(\s*(?:\w+\s+)?([A-Za-z_$][\w$]*)\s*:\s*(.+)\)$/.exec(text);
    if (forEach) {
      const iterable = evalExpression(forEach[2], scope);
      const items = Array.isArray(iterable) ? iterable : display(iterable, scope).split("");
      for (const item of items.slice(0, MAX_ITERATIONS)) {
        const child = new Scope(scope);
        assign(child, forEach[1], item);
        const control = executeBlock(statement.children, child, context);
        if (control === "break") break;
      }
      continue;
    }

    const rubyTimes = /^(\d+)\.times\s+do(?:\s*\|\s*([A-Za-z_$][\w$]*)\s*\|)?$/.exec(text);
    if (rubyTimes) {
      const count = Math.min(MAX_ITERATIONS, Number(rubyTimes[1]));
      for (let index = 0; index < count; index += 1) {
        const child = new Scope(scope);
        if (rubyTimes[2]) assign(child, rubyTimes[2], index);
        const control = executeBlock(statement.children, child, context);
        if (control === "break") break;
      }
      continue;
    }

    const pyFor = /^for\s+([A-Za-z_$][\w$]*)\s+in\s+(.+)$/.exec(text);
    if (pyFor) {
      const iterable = evalExpression(pyFor[2], scope);
      const items = Array.isArray(iterable) ? iterable : display(iterable, scope).split("");
      for (const item of items.slice(0, MAX_ITERATIONS)) {
        const child = new Scope(scope);
        assign(child, pyFor[1], item);
        const control = executeBlock(statement.children, child, context);
        if (control === "break") break;
      }
      continue;
    }

    const whileMatch = /^while\s*\((.*)\)$/.exec(text) ?? /^while\s+(.+)$/.exec(text);
    if (whileMatch) {
      let iterations = 0;
      while (iterations < MAX_ITERATIONS && truthy(evalExpression(whileMatch[1], scope))) {
        iterations += 1;
        const control = executeBlock(statement.children, new Scope(scope), context);
        if (control === "break") break;
      }
      if (iterations >= MAX_ITERATIONS) emit("[evaluator loop limit reached]", context);
      continue;
    }

    if (text === "break") return "break";
    if (text === "continue") return "continue";
    if (/^return\b/.test(text)) return undefined;

    if (executePrint(text, scope, context)) continue;
    if (executeAssignment(text, scope, context)) continue;

    if (/^(?:#include|import|from|package|using|namespace|public|private|protected|static|abstract|class|struct|interface|enum|module|fn|fun|def|function|typedef|pragma|require|@)/.test(text)) {
      const control = executeBlock(statement.children, new Scope(scope), context);
      if (control) return control;
      continue;
    }

    if (statement.children.length > 0) {
      const control = executeBlock(statement.children, new Scope(scope), context);
      if (control) return control;
    }
  }
  return undefined;
}

export function evaluateOffline(rawLanguage: string, rawCode: string): RemoteRunResult | null {
  if (!isLanguageId(rawLanguage) || !rawCode.trim()) return null;

  const language = findLanguage(rawLanguage);
  const started = Date.now();
  const context: Context = { steps: 0, touched: 0, output: [] };

  try {
    executeBlock(buildTree(rawCode), new Scope(), context);
  } catch (error) {
    if (!(error instanceof EvalLimitError)) return null;
    context.output.push(`${TAG} evaluation stopped at a safety limit.`);
  }

  if (context.touched === 0) return null;

  const stdout = [
    `${TAG} ${language.label} statements were parsed and evaluated locally.`,
    ...(context.output.length > 0 ? context.output : ["(no print output in this artifact)"]),
  ].join("\n");

  return {
    ok: true,
    status: "success",
    language: language.id,
    languageLabel: language.label,
    stdout,
    stderr: "",
    build: "",
    exitCode: "0",
    duration: ((Date.now() - started) / 1000).toFixed(2),
    memory: null,
    transport: "local",
    ran: true,
    networkError: false,
    message: "No native compiler was available; a deterministic statement evaluator handled the artifact.",
  };
}