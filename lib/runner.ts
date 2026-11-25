import {
  findLanguage,
  isLanguageId,
  type LanguageId,
  type RunnerLanguage,
} from "@/lib/languages";

/**
 * Real remote execution bridge: Paiza.IO first, Piston as fallback.
 * No output is ever invented; every line comes from a real runner.
 */

const API_BASE = (process.env.PAIZA_API_BASE ?? "https://api.paiza.io").replace(/\/+$/, "");
const API_KEY = process.env.PAIZA_API_KEY ?? "guest";
const PISTON_BASE = (process.env.PISTON_API_BASE ?? "https://emkc.org/api/v2/piston").replace(/\/+$/, "");
const MAX_CODE_CHARS = 24_000;
const MAX_OUTPUT_CHARS = 24_000;
const RUN_DEADLINE_MS = 20_000;
const POLL_INTERVAL_MS = 450;

export type RemoteRunStatus = "success" | "error" | "timeout";
export type RunnerTransport = "paiza" | "piston" | "local" | "none";

export interface RemoteRunResult {
  ok: boolean;
  status: RemoteRunStatus;
  language: LanguageId;
  languageLabel: string;
  stdout: string;
  stderr: string;
  build: string;
  exitCode: string | null;
  duration: string | null;
  memory: string | null;
  message?: string;
  transport?: RunnerTransport;
  ran?: boolean;
  networkError?: boolean;
}

interface PaizaCreate { id?: string; status?: string; error?: string }
interface PaizaDetails {
  status?: string; result?: string | null; stdout?: string | null; stderr?: string | null;
  build_stdout?: string | null; build_stderr?: string | null; exit_code?: string | null;
  time?: string | null; memory?: string | null; error?: string;
}
interface PistonOutput { stdout?: string | null; stderr?: string | null; output?: string | null; code?: number | null; signal?: string | null }
interface PistonPayload { run?: PistonOutput; compile?: PistonOutput; language?: string; version?: string; error?: string }
interface PistonSpec { language: string; filename: string }

const PISTON_LANGUAGES: Partial<Record<LanguageId, PistonSpec>> = {
  javascript: { language: "javascript", filename: "main.js" },
  typescript: { language: "typescript", filename: "main.ts" },
  tsx: { language: "typescript", filename: "main.ts" },
  python: { language: "python3", filename: "main.py" },
  java: { language: "java", filename: "Main.java" },
  c: { language: "c", filename: "main.c" },
  cpp: { language: "c++", filename: "main.cpp" },
  csharp: { language: "csharp", filename: "Main.cs" },
  go: { language: "go", filename: "main.go" },
  rust: { language: "rust", filename: "main.rs" },
  ruby: { language: "ruby", filename: "main.rb" },
  php: { language: "php", filename: "main.php" },
  kotlin: { language: "kotlin", filename: "Main.kt" },
  swift: { language: "swift", filename: "main.swift" },
  scala: { language: "scala", filename: "Main.scala" },
  haskell: { language: "haskell", filename: "main.hs" },
  elixir: { language: "elixir", filename: "main.exs" },
  fsharp: { language: "fsharp", filename: "main.fsx" },
  d: { language: "d", filename: "main.d" },
  perl: { language: "perl", filename: "main.pl" },
  r: { language: "r", filename: "main.r" },
  bash: { language: "bash", filename: "main.sh" },
  scheme: { language: "scheme", filename: "main.scm" },
  commonlisp: { language: "commonlisp", filename: "main.lisp" },
  objectivec: { language: "objective-c", filename: "main.m" },
  coffeescript: { language: "coffeescript", filename: "main.coffee" },
  lua: { language: "lua", filename: "main.lua" },
  powershell: { language: "powershell", filename: "main.ps1" },
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.replace(/\r\n?/g, "\n");
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + "\n… [output truncated by NecroCode]";
}

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|fetch failed|network|offline|timed out/i.test(error.message);
}

function resolveLanguage(raw: string): { language: RunnerLanguage; valid: boolean } {
  if (!isLanguageId(raw)) return { language: findLanguage("javascript"), valid: false };
  return { language: findLanguage(raw), valid: true };
}

function base(language: RunnerLanguage, transport: RunnerTransport): RemoteRunResult {
  return {
    ok: false, status: "error", language: language.id, languageLabel: language.label,
    stdout: "", stderr: "", build: "", exitCode: null, duration: null, memory: null,
    transport, ran: false, networkError: false,
  };
}

function fail(
  language: RunnerLanguage,
  message: string,
  status: RemoteRunStatus = "error",
  transport: RunnerTransport = "paiza",
  networkError = false,
): RemoteRunResult {
  return { ...base(language, transport), status, message, networkError };
}

function normalizePaiza(language: RunnerLanguage, details: PaizaDetails): RemoteRunResult {
  const build = clamp([details.build_stdout, details.build_stderr].filter(Boolean).join("\n"));
  const stdout = clamp(details.stdout);
  const stderr = clamp(details.stderr);
  const result = details.result ?? "";

  if (details.error) {
    return { ...fail(language, details.error, "error", "paiza"), build, stdout, stderr };
  }

  const timedOut = result === "timeout";
  const succeeded = result === "success" && !timedOut;
  const ran = Boolean(result && result !== "InternalError");

  return {
    ok: succeeded,
    status: timedOut ? "timeout" : succeeded ? "success" : "error",
    language: language.id,
    languageLabel: language.label,
    stdout, stderr, build,
    exitCode: details.exit_code ?? (ran ? "0" : null),
    duration: details.time ?? null,
    memory: details.memory ?? null,
    transport: "paiza",
    ran,
    networkError: false,
    message: timedOut ? "The remote runner hit its execution limit before the artifact finished." : undefined,
  };
}

export async function executePaiza(rawLanguage: string, rawCode: string): Promise<RemoteRunResult> {
  const { language, valid } = resolveLanguage(rawLanguage);
  if (!valid) return fail(language, "Unknown sandbox language: " + rawLanguage);
  if (!rawCode.trim()) return fail(language, "The sandbox received an empty artifact.");

  const code = rawCode.length > MAX_CODE_CHARS ? rawCode.slice(0, MAX_CODE_CHARS) : rawCode;
  const controller = new AbortController();
  const deadline = Date.now() + RUN_DEADLINE_MS;
  const timer = setTimeout(() => controller.abort(), RUN_DEADLINE_MS);

  try {
    const createdResponse = await fetch(API_BASE + "/runners/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_code: code, language: language.paiza, api_key: API_KEY, input: "" }),
      cache: "no-store",
      signal: controller.signal,
    });
    const created = (await createdResponse.json().catch(() => ({}))) as PaizaCreate;

    if (!createdResponse.ok || !created.id) {
      return fail(
        language,
        created.error ?? "Paiza.IO rejected the artifact (HTTP " + createdResponse.status + ").",
        "error", "paiza", createdResponse.status >= 500,
      );
    }

    while (Date.now() < deadline) {
      await wait(POLL_INTERVAL_MS);
      const detailsResponse = await fetch(
        API_BASE + "/runners/get_details?id=" + encodeURIComponent(created.id) + "&api_key=" + encodeURIComponent(API_KEY),
        { cache: "no-store", signal: controller.signal },
      );
      const details = (await detailsResponse.json().catch(() => ({}))) as PaizaDetails;
      if (!detailsResponse.ok) {
        return fail(
          language,
          details.error ?? "Paiza.IO lost the artifact (HTTP " + detailsResponse.status + ").",
          "error", "paiza", detailsResponse.status >= 500,
        );
      }
      if (details.status === "running") continue;
      return normalizePaiza(language, details);
    }

    return fail(language, "Paiza.IO did not answer before the 20-second deadline.", "timeout", "paiza", true);
  } catch (error) {
    const network = isNetworkError(error);
    const timedOut = error instanceof Error && error.name === "AbortError";
    return fail(
      language,
      network
        ? "Paiza.IO could not be reached (offline or network error)."
        : error instanceof Error ? error.message : "Paiza.IO could not be reached.",
      timedOut ? "timeout" : "error", "paiza", network,
    );
  } finally {
    clearTimeout(timer);
  }
}

export const executeRemote = executePaiza;

export async function executePiston(rawLanguage: string, rawCode: string): Promise<RemoteRunResult> {
  const { language, valid } = resolveLanguage(rawLanguage);
  if (!valid) return fail(language, "Unknown sandbox language: " + rawLanguage, "error", "piston");

  const spec = PISTON_LANGUAGES[language.id];
  if (!spec) return fail(language, "Piston does not provide a " + language.label + " runtime.", "error", "piston");
  if (!rawCode.trim()) return fail(language, "The sandbox received an empty artifact.", "error", "piston");

  const code = rawCode.length > MAX_CODE_CHARS ? rawCode.slice(0, MAX_CODE_CHARS) : rawCode;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_DEADLINE_MS);

  try {
    const response = await fetch(PISTON_BASE + "/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: spec.language,
        files: [{ name: spec.filename, content: code }],
        stdin: "",
        run_timeout: 5_000,
        compile_timeout: 10_000,
        output_max_size: MAX_OUTPUT_CHARS,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as PistonPayload;

    if (!response.ok) {
      return fail(
        language,
        payload.error ?? "Piston rejected the artifact (HTTP " + response.status + ").",
        "error", "piston", response.status >= 500,
      );
    }
    if (!payload.run) {
      return fail(language, payload.error ?? "Piston returned no execution result.", "error", "piston");
    }

    const run = payload.run;
    const compile = payload.compile ?? {};
    const compileCode = typeof compile.code === "number" ? compile.code : 0;
    const runCode = typeof run.code === "number" ? run.code : run.signal ? 1 : 0;
    const exitCode = compileCode !== 0 ? compileCode : runCode;
    const timedOut = /timeout/i.test(run.signal ?? "");
    const ok = exitCode === 0 && !payload.error && !timedOut;

    return {
      ok,
      status: timedOut ? "timeout" : ok ? "success" : "error",
      language: language.id,
      languageLabel: language.label,
      stdout: clamp(run.stdout ?? run.output ?? ""),
      stderr: clamp(run.stderr ?? ""),
      build: clamp([compile.stdout, compile.stderr].filter(Boolean).join("\n")),
      exitCode: String(exitCode),
      duration: null,
      memory: null,
      transport: "piston",
      ran: true,
      networkError: false,
      message: payload.error,
    };
  } catch (error) {
    const network = isNetworkError(error);
    const timedOut = error instanceof Error && error.name === "AbortError";
    return fail(
      language,
      network
        ? "Piston could not be reached (offline or network error)."
        : error instanceof Error ? error.message : "Piston could not be reached.",
      timedOut ? "timeout" : "error", "piston", network,
    );
  } finally {
    clearTimeout(timer);
  }
}