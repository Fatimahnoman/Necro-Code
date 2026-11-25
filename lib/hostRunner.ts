import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { findLanguage, isLanguageId, type RunnerLanguage } from "@/lib/languages";
import type { RemoteRunResult } from "@/lib/runner";

/** Offline, zero-hallucination fallback: real host toolchain in a temp dir. */
const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 4_000;

interface Step { command: string; args: string[] }
interface Spec { filename?: string; tools: string[]; steps: Step[] }
interface Outcome { stdout: string; stderr: string; exitCode: number; missing: boolean; timedOut: boolean }
interface ExecError extends Error { code?: number | string; killed?: boolean; stdout?: string | Buffer; stderr?: string | Buffer }

function clamp(value: string): string {
  const text = value.replace(/\r\n?/g, "\n");
  return text.length <= 24_000 ? text : text.slice(0, 24_000) + "\n… [truncated by NecroCode]";
}

async function run(command: string, args: string[], cwd: string): Promise<Outcome> {
  try {
    const result = await execFileAsync(command, args, {
      cwd, timeout: TIMEOUT_MS, maxBuffer: 1_000_000, windowsHide: true, encoding: "utf8",
    });
    return { stdout: clamp(String(result.stdout ?? "")), stderr: clamp(String(result.stderr ?? "")), exitCode: 0, missing: false, timedOut: false };
  } catch (error) {
    const e = error as ExecError;
    return {
      stdout: clamp(String(e.stdout ?? "")),
      stderr: clamp(String(e.stderr ?? "")),
      exitCode: typeof e.code === "number" ? e.code : 1,
      missing: e.code === "ENOENT",
      timedOut: Boolean(e.killed) || /ETIMEDOUT|timed out/i.test(e.message ?? ""),
    };
  }
}

async function exists(command: string): Promise<boolean> {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = await run(checker, [command], process.cwd());
  return !result.missing && result.exitCode === 0;
}

async function first(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  return null;
}

function localBase(language: RunnerLanguage): RemoteRunResult {
  return {
    ok: false, status: "error", language: language.id, languageLabel: language.label,
    stdout: "", stderr: "", build: "", exitCode: null, duration: null, memory: null,
    transport: "local", ran: false, networkError: false,
  };
}

async function specFor(language: RunnerLanguage, dir: string, code: string): Promise<Spec | null> {
  const exe = process.platform === "win32" ? "main.exe" : "main";
  const out = join(dir, exe);
  const simple = (filename: string, command: string, args: string[]): Spec => ({
    filename, tools: [command], steps: [{ command, args }],
  });
  const compiled = (filename: string, compiler: string, args: string[]): Spec => ({
    filename, tools: [compiler], steps: [{ command: compiler, args }, { command: out, args: [] }],
  });

  switch (language.id) {
    case "javascript": {
      const node = await first(["node", "nodejs"]);
      return node ? simple("main.js", node, ["main.js"]) : null;
    }
    case "python": {
      const python = await first(process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"]);
      return python ? simple("main.py", python, ["main.py"]) : null;
    }
    case "java": {
      const name = /public\s+(?:final\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(code)?.[1] ?? "Main";
      return {
        filename: name + ".java",
        tools: ["javac", "java"],
        steps: [
          { command: "javac", args: [name + ".java"] },
          { command: "java", args: ["-cp", ".", name] },
        ],
      };
    }
    case "c": return compiled("main.c", "gcc", ["main.c", "-o", exe]);
    case "cpp": return compiled("main.cpp", "g++", ["main.cpp", "-o", exe]);
    case "csharp": {
      const compiler = await first(["csc", "mcs"]);
      return compiler ? compiled("Main.cs", compiler, ["Main.cs", "-out:" + exe]) : null;
    }
    case "go": {
      const go = await first(["go"]);
      return go ? simple("main.go", go, ["run", "main.go"]) : null;
    }
    case "rust": return compiled("main.rs", "rustc", ["main.rs", "-o", exe]);
    case "ruby": {
      const ruby = await first(["ruby"]);
      return ruby ? simple("main.rb", ruby, ["main.rb"]) : null;
    }
    case "php": {
      const php = await first(["php"]);
      return php ? simple("main.php", php, ["main.php"]) : null;
    }
    case "kotlin":
      return {
        filename: "Main.kt", tools: ["kotlinc", "java"],
        steps: [
          { command: "kotlinc", args: ["Main.kt", "-include-runtime", "-d", "main.jar"] },
          { command: "java", args: ["-jar", "main.jar"] },
        ],
      };
    case "swift": return compiled("main.swift", "swiftc", ["main.swift", "-o", exe]);
    case "scala": {
      const scala = await first(["scala", "scalac"]);
      return scala ? simple("Main.scala", scala, ["Main.scala"]) : null;
    }
    case "haskell": {
      const runghc = await first(["runghc", "runhaskell"]);
      return runghc ? simple("main.hs", runghc, ["main.hs"]) : null;
    }
    case "elixir": {
      const elixir = await first(["elixir"]);
      return elixir ? simple("main.exs", elixir, ["main.exs"]) : null;
    }
    case "fsharp": {
      const dotnet = await first(["dotnet"]);
      return dotnet ? simple("main.fsx", dotnet, ["fsi", "main.fsx"]) : null;
    }
    case "d": return compiled("main.d", "dmd", ["main.d", "-of=" + out]);
    case "perl": {
      const perl = await first(["perl"]);
      return perl ? simple("main.pl", perl, ["main.pl"]) : null;
    }
    case "r": {
      const rscript = await first(["Rscript", "rscript"]);
      return rscript ? simple("main.r", rscript, ["main.r"]) : null;
    }
    case "bash": {
      const bash = await first(["bash", "sh"]);
      return bash ? simple("main.sh", bash, ["main.sh"]) : null;
    }
    case "powershell": {
      const shell = await first(["pwsh", "powershell"]);
      return shell ? simple("main.ps1", shell, ["-NoProfile", "-File", "main.ps1"]) : null;
    }
    case "lua": {
      const lua = await first(["lua", "lua5.4", "lua5.3"]);
      return lua ? simple("main.lua", lua, ["main.lua"]) : null;
    }
    case "sql": {
      const sqlite = await first(["sqlite3"]);
      return sqlite ? simple("main.sql", sqlite, [":memory:", ".read", "main.sql"]) : null;
    }
    case "scheme": {
      const scheme = await first(["guile", "scheme", "csi"]);
      if (!scheme) return null;
      return simple("main.scm", scheme, scheme === "scheme" ? ["--script", "main.scm"] : ["-s", "main.scm"]);
    }
    case "commonlisp": {
      const lisp = await first(["sbcl", "clisp"]);
      if (!lisp) return null;
      return simple("main.lisp", lisp, lisp === "sbcl" ? ["--script", "main.lisp"] : ["main.lisp"]);
    }
    case "vb": {
      const compiler = await first(["vbc", "vbnc"]);
      return compiler ? compiled("main.vb", compiler, ["main.vb", "-out:" + exe]) : null;
    }
    case "objectivec": {
      const clang = await first(["clang", "gcc"]);
      if (!clang) return null;
      return compiled("main.m", clang, clang === "clang"
        ? ["main.m", "-o", exe, "-framework", "Foundation"]
        : ["main.m", "-o", exe, "-lobjc"]);
    }
    case "coffeescript": {
      const coffee = await first(["coffee"]);
      return coffee ? simple("main.coffee", coffee, ["main.coffee"]) : null;
    }
    case "cobol": {
      const cobc = await first(["cobc"]);
      return cobc ? compiled("main.cob", cobc, ["-x", "main.cob", "-o", exe]) : null;
    }
    default:
      return null;
  }
}

export async function executeLocal(rawLanguage: string, rawCode: string): Promise<RemoteRunResult> {
  if (!isLanguageId(rawLanguage)) {
    return { ...localBase(findLanguage("javascript")), message: "Unknown sandbox language: " + rawLanguage };
  }
  if (!rawCode.trim()) {
    return { ...localBase(findLanguage(rawLanguage)), message: "The sandbox received an empty artifact." };
  }

  const language = findLanguage(rawLanguage);
  const started = Date.now();
  let dir: string | null = null;

  try {
    dir = await mkdtemp(join(tmpdir(), "necrocode-"));
    const spec = await specFor(language, dir, rawCode);
    if (!spec) return localBase(language);

    for (const tool of spec.tools) if (!(await exists(tool))) return localBase(language);
    if (spec.filename) await writeFile(join(dir, spec.filename), rawCode, "utf8");

    let build = "";
    let stdout = "";
    let stderr = "";
    let exitCode = 1;
    let timedOut = false;

    for (const step of spec.steps) {
      const result = await run(step.command, step.args, dir);
      if (result.missing) return localBase(language);
      timedOut = result.timedOut;
      exitCode = result.exitCode;
      if (step === spec.steps[0] && spec.steps.length > 1) {
        build = clamp([result.stdout, result.stderr].filter(Boolean).join("\n"));
        if (result.exitCode !== 0 || result.timedOut) break;
        continue;
      }
      stdout = result.stdout;
      stderr = result.stderr;
    }

    const ok = exitCode === 0 && !timedOut;
    return {
      ...localBase(language),
      ok,
      status: timedOut ? "timeout" : ok ? "success" : "error",
      stdout, stderr, build,
      exitCode: String(exitCode),
      duration: ((Date.now() - started) / 1000).toFixed(2),
      ran: true,
      message: timedOut ? "Local " + language.label + " run exceeded the 4000ms limit." : undefined,
    };
  } catch (error) {
    return {
      ...localBase(language),
      ran: true,
      stderr: clamp(error instanceof Error ? error.name + ": " + error.message : String(error)),
      message: "The local toolchain failed before the artifact could run.",
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}