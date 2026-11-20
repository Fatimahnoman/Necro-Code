import {
  findLanguage,
  isLanguageId,
  type LanguageId,
  type RunnerLanguage,
} from "@/lib/languages";

/**
 * Remote execution bridge. The browser sandbox is intentionally JS-only;
 * every other language is compiled and executed by the Paiza.IO runner.
 *
 * Set PAIZA_API_BASE / PAIZA_API_KEY to point at a self-hosted or registered
 * runner. The public guest key is used as a zero-config fallback for the demo.
 */

const API_BASE = (
  process.env.PAIZA_API_BASE ?? "https://api.paiza.io"
).replace(/\/+$/, "");
const API_KEY = process.env.PAIZA_API_KEY ?? "guest";
const MAX_CODE_CHARS = 24_000;
const MAX_OUTPUT_CHARS = 24_000;
const RUN_DEADLINE_MS = 20_000;
const POLL_INTERVAL_MS = 450;

export type RemoteRunStatus = "success" | "error" | "timeout";

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
}

interface PaizaCreateResponse {
  id?: string;
  status?: string;
  error?: string;
}

interface PaizaDetailsResponse {
  status?: string;
  result?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  build_stdout?: string | null;
  build_stderr?: string | null;
  exit_code?: string | null;
  time?: string | null;
  memory?: string | null;
  error?: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.replace(/\r\n?/g, "\n");
  if (normalized.length <= MAX_OUTPUT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_OUTPUT_CHARS)}\n… [output truncated by NecroCode]`;
}

function failed(
  language: RunnerLanguage,
  message: string,
  status: RemoteRunStatus = "error",
): RemoteRunResult {
  return {
    ok: false,
    status,
    language: language.id,
    languageLabel: language.label,
    stdout: "",
    stderr: "",
    build: "",
    exitCode: null,
    duration: null,
    memory: null,
    message,
  };
}

function normalize(
  language: RunnerLanguage,
  details: PaizaDetailsResponse,
): RemoteRunResult {
  const build = clamp(
    [details.build_stdout, details.build_stderr]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join("\n"),
  );
  const stdout = clamp(details.stdout);
  const stderr = clamp(details.stderr);
  const result = details.result ?? "";

  if (details.error) {
    return {
      ...failed(language, details.error),
      build,
      stdout,
      stderr,
    };
  }

  const timedOut = result === "timeout";
  const succeeded = result === "success" && !timedOut;

  return {
    ok: succeeded,
    status: timedOut ? "timeout" : succeeded ? "success" : "error",
    language: language.id,
    languageLabel: language.label,
    stdout,
    stderr,
    build,
    exitCode: details.exit_code ?? null,
    duration: details.time ?? null,
    memory: details.memory ?? null,
    message: timedOut
      ? "The remote runner hit its execution limit before the artifact finished."
      : undefined,
  };
}

export async function executeRemote(
  rawLanguage: string,
  rawCode: string,
): Promise<RemoteRunResult> {
  const language = isLanguageId(rawLanguage)
    ? findLanguage(rawLanguage)
    : findLanguage("javascript");

  if (!isLanguageId(rawLanguage)) {
    return failed(language, `Unknown sandbox language: ${rawLanguage}.`);
  }

  if (rawCode.trim().length === 0) {
    return failed(language, "The sandbox received an empty artifact.");
  }

  const code = rawCode.length > MAX_CODE_CHARS
    ? rawCode.slice(0, MAX_CODE_CHARS)
    : rawCode;

  const controller = new AbortController();
  const deadline = Date.now() + RUN_DEADLINE_MS;
  const timer = setTimeout(() => controller.abort(), RUN_DEADLINE_MS);

  try {
    const createResponse = await fetch(`${API_BASE}/runners/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_code: code,
        language: language.paiza,
        api_key: API_KEY,
        input: "",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const created = (await createResponse.json().catch(() => ({}))) as
      PaizaCreateResponse;

    if (!createResponse.ok || !created.id) {
      return failed(
        language,
        created.error ??
          `The remote runner rejected the artifact (HTTP ${createResponse.status}).`,
      );
    }

    while (Date.now() < deadline) {
      await wait(POLL_INTERVAL_MS);

      const detailsResponse = await fetch(
        `${API_BASE}/runners/get_details?id=${encodeURIComponent(created.id)}&api_key=${encodeURIComponent(API_KEY)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const details = (await detailsResponse
        .json()
        .catch(() => ({}))) as PaizaDetailsResponse;

      if (!detailsResponse.ok) {
        return failed(
          language,
          details.error ??
            `The remote runner lost the artifact (HTTP ${detailsResponse.status}).`,
        );
      }

      if (details.status === "running") continue;
      return normalize(language, details);
    }

    return failed(
      language,
      "The remote runner did not answer before the 20-second deadline.",
      "timeout",
    );
  } catch (error) {
    return failed(
      language,
      error instanceof Error && error.name === "AbortError"
        ? "The remote runner did not answer before the 20-second deadline."
        : "The remote runner could not be reached. Try again in a moment.",
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "error",
    );
  } finally {
    clearTimeout(timer);
  }
}
