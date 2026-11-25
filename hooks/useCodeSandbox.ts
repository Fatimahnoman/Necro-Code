"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findLanguage, type RunnerLanguage } from "@/lib/languages";
import { executeLocalSql, isSqlFailure } from "@/lib/localSql";
import type { RemoteRunResult } from "@/lib/runner";
import { transform, type Transform } from "sucrase";

export type SandboxLineKind =
  | "log"
  | "info"
  | "warn"
  | "error"
  | "debug"
  | "result"
  | "system";

export interface SandboxLine {
  kind: SandboxLineKind;
  text: string;
}

export type SandboxStatus =
  | "idle"
  | "running"
  | "complete"
  | "error"
  | "timeout";

export type SandboxMode = "local" | "remote";

export interface SandboxState {
  status: SandboxStatus;
  mode: SandboxMode | null;
  lines: SandboxLine[];
  /** Remote runner exit code as a string (`"0"` = success); `null` locally. */
  exitCode: string | null;
}

const LOCAL_TIMEOUT_MS = 5_000;
const PYODIDE_TIMEOUT_MS = 5_000;
const REMOTE_TIMEOUT_MS = 5_000;
const MAX_LINES = 120;

const BROWSER_JS = new Set(["javascript", "typescript", "tsx"]);

/** Web Worker for JavaScript / transpiled TypeScript / transpiled TSX. */
const JS_WORKER_SOURCE = String.raw`
let __necroLogCount = 0;

const formatValue = (value, depth, seen) => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "number" || type === "boolean" || type === "bigint") return String(value);
  if (type === "function") return "[Function " + (value.name || "anonymous") + "]";
  if (type === "symbol") return value.toString();
  if (value instanceof Error) return value.stack || value.name + ": " + value.message;

  const currentDepth = depth || 0;
  const currentSeen = seen || new WeakSet();
  if (currentDepth > 3) return Array.isArray(value) ? "[…]" : "{…}";
  if (currentSeen.has(value)) return "[Circular]";
  currentSeen.add(value);

  if (Array.isArray(value)) {
    return "[" + value.map((item) => formatValue(item, currentDepth + 1, currentSeen)).join(", ") + "]";
  }

  try {
    const keys = Object.keys(value);
    const body = keys
      .slice(0, 20)
      .map((key) => key + ": " + formatValue(value[key], currentDepth + 1, currentSeen))
      .join(", ");
    return "{" + body + (keys.length > 20 ? ", …" : "") + "}";
  } catch {
    return String(value);
  }
};

const formatArgument = (value) => typeof value === "string" ? value : formatValue(value);

const emit = (kind, args) => {
  self.postMessage({
    type: "line",
    kind,
    text: args.map(formatArgument).join(" "),
  });
};

console.log = (...args) => { __necroLogCount += 1; emit("log", args); };
console.info = (...args) => emit("info", args);
console.warn = (...args) => emit("warn", args);
console.error = (...args) => emit("error", args);
console.debug = (...args) => emit("debug", args);

const seal = (name) => {
  try {
    Object.defineProperty(self, name, {
      value: () => { throw new Error(name + " is sealed inside the NecroCode sandbox."); },
      configurable: false,
      writable: false,
    });
  } catch {}
};
["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].forEach(seal);

const UNSAFE_CALL = /^(?:fetch|setInterval|setTimeout|setImmediate|requestAnimationFrame|queueMicrotask|createRoot|render|hydrate|import|require|eval|exec|use[A-Z]\w*|componentDid\w*|constructor)$/i;

const extractFunctions = (source) => {
  const names = [];
  const declaration = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/gm;
  const assigned = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)\n]*\)\s*(?::[^=\n]+)?=>|[A-Za-z_$][\w$]*\s*=>)/gm;
  for (const match of source.matchAll(declaration)) names.push(match[1]);
  for (const match of source.matchAll(assigned)) names.push(match[1]);
  return Array.from(new Set(names)).filter((name) => !UNSAFE_CALL.test(name)).slice(0, 40);
};

const parameterNames = (source, name) => {
  const escaped = name.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  const declaration = new RegExp(
    "^(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s*" + escaped + "\\s*\\(([^)\\n]*)\\)",
    "m",
  );
  const assigned = new RegExp(
    "^(?:export\\s+)?(?:const|let|var)\\s+" + escaped + "\\s*=\\s*(?:async\\s+)?(?:function\\s*\\(([^)\\n]*)\\)|\\(([^)\\n]*)\\)|([A-Za-z_$][\\w$]*)\\s*=>)",
    "m",
  );
  const match = source.match(declaration) || source.match(assigned);
  if (!match) return [];
  const raw = match[1] || match[2] || match[3] || "";
  return raw
    .split(",")
    .map((part) => part.split("=")[0].trim().replace(/[?:\s].*$/, ""))
    .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part));
};

const sampleArg = (param, index) => {
  const key = param.toLowerCase().replace(/[^a-z]/g, "");
  if (/name|spirit|user|item|entity/.test(key)) return "wraith";
  if (/id|identifier/.test(key)) return "wraith";
  if (/level|power|count|index|limit|times|^n$/.test(key)) return 1;
  if (key === "a") return 6;
  if (key === "b") return 3;
  if (/x|value|number|num|amount|input/.test(key)) return 7;
  if (/flag|enabled|active|ok|strict/.test(key)) return true;
  if (/items|arr|array|list|values|spirits|ghosts/.test(key)) return [1, 2, 3];
  if (/obj|config|options|payload|data/.test(key)) return {};
  return index === 0 ? "wraith" : 1;
};

const autoCall = async (api, source, names) => {
  if (__necroLogCount > 0 || names.length === 0) return;
  for (const name of names) {
    const fn = api[name];
    if (typeof fn !== "function") continue;
    const args = parameterNames(source, name).map(sampleArg);
    const label = name + "(" + args.map(formatArgument).join(", ") + ")";
    try {
      const value = await fn(...args);
      emit("result", ["→ " + label + " => " + formatValue(value)]);
    } catch (error) {
      emit("result", ["→ " + label + " threw " + formatValue(error)]);
    }
  }
};

self.onmessage = async (event) => {
  const code = event && event.data && event.data.code;
  if (typeof code !== "string") {
    self.postMessage({ type: "done" });
    return;
  }

  try {
    const names = extractFunctions(code);
    const apiReturn = names.length
      ? "return { " + names.map((name) => name + ": typeof " + name + " === \"function\" ? " + name + " : undefined").join(", ") + " };"
      : "return {};";
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const body = [
      "\"use strict\";",
      "const process = { argv: [\"node\", \"artifact.js\", \"1\"], env: {}, stdout: { write: (text) => { String(text).split(\"\\n\").forEach((line, i, all) => { if (i === all.length - 1 && line === \"\") return; console.log(line); }); return true; } }, stderr: { write: (text) => { String(text).split(\"\\n\").forEach((line, i, all) => { if (i === all.length - 1 && line === \"\") return; console.error(line); }); return true; } } };",
      "const module = { exports: {} };",
      "const exports = module.exports;",
      "const require = (name) => { throw new Error(\"External module \" + name + \" is not available inside the sandbox.\"); };",
      "const __necroApi = await (async () => {",
      code,
      apiReturn,
      "})();",
      "return __necroApi;",
    ].join("\n");

    const fn = new AsyncFunction(body);
    const api = await fn();
    await autoCall(api, code, names);
    self.postMessage({ type: "done" });
  } catch (error) {
    emit("error", [error]);
    self.postMessage({ type: "done" });
  }
};
`;

/** Web Worker for Pyodide — stdout/stderr are real Python streams. */
const PY_WORKER_SOURCE = String.raw`
const emit = (kind, text) => {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    if (index === lines.length - 1 && line === "") return;
    self.postMessage({ type: "line", kind, text: line });
  });
};

const PYODIDE_SOURCES = [
  "/pyodide/pyodide.js",
  "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js",
  "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js",
];

const loadPyodide = async () => {
  for (const source of PYODIDE_SOURCES) {
    try {
      importScripts(source);
      if (typeof self.loadPyodide === "function") {
        const indexURL = source.slice(0, source.lastIndexOf("/") + 1);
        return await self.loadPyodide({ indexURL });
      }
    } catch {}
  }
  throw new Error(
    "Pyodide runtime is unavailable (no local /pyodide/ assets and the CDN could not be reached).",
  );
};

self.onmessage = async (event) => {
  const code = event && event.data && event.data.code;
  if (typeof code !== "string") {
    self.postMessage({ type: "done" });
    return;
  }

  let pyodide;
  try {
    pyodide = await loadPyodide();
  } catch (error) {
    self.postMessage({
      type: "runtime-unavailable",
      message: error instanceof Error ? error.message : String(error),
    });
    self.postMessage({ type: "done" });
    return;
  }

  try {
    pyodide.setStdout({ batched: (text) => emit("log", text) });
    pyodide.setStderr({ batched: (text) => emit("error", text) });
    await pyodide.runPythonAsync(code);
    self.postMessage({ type: "done" });
  } catch (error) {
    emit("error", error instanceof Error ? (error.stack || error.message) : String(error));
    self.postMessage({ type: "done" });
  }
};
`;

const IDLE: SandboxState = {
  status: "idle",
  mode: null,
  lines: [],
  exitCode: null,
};

function splitOutput(text: string): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\s+$/, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
}

function transpileForWorker(code: string, languageId: string): string {
  if (languageId === "javascript") return code;
  const transforms: Transform[] = languageId === "tsx"
    ? ["typescript", "jsx", "imports"]
    : ["typescript", "imports"];
  try {
    return transform(code, {
      transforms,
      jsxRuntime: "classic",
      production: true,
      disableESTransforms: true,
    }).code;
  } catch (error) {
    throw new Error(
      `TypeScript compile failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function useCodeSandbox() {
  const workerRef = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const remoteAbortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<SandboxState>(IDLE);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    remoteAbortRef.current?.abort();
    remoteAbortRef.current = null;
    cleanupWorker();
  }, [clearTimer, cleanupWorker]);

  const clear = useCallback(() => {
    stop();
    setState(IDLE);
  }, [stop]);

  const append = useCallback((line: SandboxLine) => {
    setState((prev) => ({
      ...prev,
      lines: [...prev.lines, line].slice(-MAX_LINES),
    }));
  }, []);

  const appendMany = useCallback(
    (lines: SandboxLine[], status?: SandboxStatus) => {
      if (lines.length === 0 && !status) return;
      setState((prev) => ({
        ...prev,
        status: status ?? prev.status,
        lines: [...prev.lines, ...lines].slice(-MAX_LINES),
      }));
    },
    [],
  );

  const startRemote = useCallback(
    (code: string, language: RunnerLanguage, announce: boolean) => {
      const controller = new AbortController();
      remoteAbortRef.current = controller;

      if (announce) {
        setState({
          status: "running",
          mode: "remote",
          exitCode: null,
          lines: [
            {
              kind: "system",
              text: `» Sending the purified ${language.label} artifact to the dual-cloud pyre…`,
            },
            ...(language.note
              ? [{ kind: "system" as SandboxLineKind, text: `⚠ ${language.note}` }]
              : []),
            {
              kind: "system",
              text: "⚠ Paiza.IO first, Piston fallback, then the host toolchain. No output is invented.",
            },
          ],
        });
      } else {
        appendMany([{ kind: "system", text: "» Falling back to the server runner…" }], "running");
      }

      clearTimer();
      timerRef.current = window.setTimeout(() => {
        controller.abort();
        appendMany(
          [{ kind: "system", text: "⏱ 5.0s remote limit reached — the request was aborted." }],
          "timeout",
        );
      }, REMOTE_TIMEOUT_MS);

      void (async () => {
        try {
          const response = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: language.id, code }),
            signal: controller.signal,
          });

          const payload = (await response.json().catch(() => ({}))) as Partial<RemoteRunResult>;

          if (!response.ok && !payload.message) {
            throw new Error(`The remote pyre rejected the artifact (HTTP ${response.status}).`);
          }

          const lines: SandboxLine[] = [];
          const runner = payload.transport ? ` (${payload.transport})` : "";

          for (const [text, kind] of [
            ...splitOutput(payload.build ?? "").map((line) => [line, "warn"] as const),
            ...splitOutput(payload.stdout ?? "").map((line) => [line, "log"] as const),
            ...splitOutput(payload.stderr ?? "").map((line) => [line, "error"] as const),
          ]) {
            lines.push({ kind, text });
          }

          if (payload.exitCode !== null && payload.exitCode !== undefined) {
            lines.push({
              kind: "system",
              text: `» exit ${payload.exitCode}${payload.duration ? ` · ${payload.duration}s` : ""}${runner}`,
            });
          }

          if (payload.message) {
            lines.push({
              kind: payload.status === "timeout" ? "system" : "error",
              text: payload.message,
            });
          } else if (!payload.ok) {
            lines.push({
              kind: "error",
              text: `✗ ${payload.languageLabel ?? language.label} run failed${runner}`,
            });
          }

          if (payload.ok) {
            lines.push({
              kind: "result",
              text: `✓ ${payload.languageLabel ?? language.label} run complete${runner}`,
            });
          }

          const exitCode =
            payload.exitCode === null || payload.exitCode === undefined
              ? null
              : String(payload.exitCode).trim();
          setState((prev) => ({ ...prev, exitCode }));
          appendMany(
            lines,
            payload.ok
              ? "complete"
              : payload.status === "timeout"
                ? "timeout"
                : "error",
          );
        } catch (error) {
          if (controller.signal.aborted) return;
          appendMany(
            [
              {
                kind: "error",
                text: error instanceof Error ? error.message : "The remote pyre did not answer.",
              },
            ],
            "error",
          );
        } finally {
          clearTimer();
          if (remoteAbortRef.current === controller) remoteAbortRef.current = null;
        }
      })();
    },
    [appendMany, clearTimer],
  );

  const runJs = useCallback(
    (code: string, language: RunnerLanguage) => {
      let executable: string;
      try {
        executable = transpileForWorker(code, language.id);
      } catch (error) {
        setState({
          status: "error",
          mode: "local",
          exitCode: null,
          lines: [
            {
              kind: "system",
              text: `» Transpiling the purified ${language.label} artifact…`,
            },
            {
              kind: "error",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        });
        return;
      }

      setState({
        status: "running",
        mode: "local",
        exitCode: null,
        lines: [
          {
            kind: "system",
            text:
              language.id === "javascript"
                ? "» Sealing the purified JavaScript artifact inside an isolated Web Worker…"
                : `» Transpiled ${language.label} → JavaScript inside an isolated Web Worker…`,
          },
        ],
      });

      try {
        const blob = new Blob([JS_WORKER_SOURCE], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const worker = new Worker(url);
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as {
            type?: string;
            kind?: SandboxLineKind;
            text?: string;
          };
          if (data.type === "line" && data.kind && typeof data.text === "string") {
            setState((prev) => ({
              ...prev,
              status: data.kind === "error" ? "error" : prev.status,
              lines: [...prev.lines, { kind: data.kind!, text: data.text! }].slice(-MAX_LINES),
            }));
            return;
          }
          if (data.type === "done") {
            clearTimer();
            if (workerRef.current === worker) cleanupWorker();
            setState((prev) => ({
              ...prev,
              status: prev.status === "error" ? "error" : "complete",
            }));
          }
        };

        worker.onerror = (event) => {
          append({ kind: "error", text: event.message || "The sandbox worker collapsed." });
          setState((prev) => ({ ...prev, status: "error" }));
          stop();
        };

        timerRef.current = window.setTimeout(() => {
          append({
            kind: "system",
            text: `⏱ ${LOCAL_TIMEOUT_MS / 1000}.0s limit reached — the worker was terminated.`,
          });
          setState((prev) => ({ ...prev, status: "timeout" }));
          stop();
        }, LOCAL_TIMEOUT_MS);

        worker.postMessage({ code: executable });
      } catch (error) {
        append({
          kind: "error",
          text: error instanceof Error ? error.message : "This browser refused to open the sandbox.",
        });
        setState((prev) => ({ ...prev, status: "error" }));
        stop();
      }
    },
    [append, cleanupWorker, clearTimer, stop],
  );

  const runPython = useCallback(
    (code: string, language: RunnerLanguage) => {
      setState({
        status: "running",
        mode: "local",
        exitCode: null,
        lines: [
          { kind: "system", text: "» Loading the local Pyodide runtime for real Python stdout/stderr…" },
        ],
      });

      try {
        const blob = new Blob([PY_WORKER_SOURCE], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const worker = new Worker(url);
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as {
            type?: string;
            kind?: SandboxLineKind;
            text?: string;
            message?: string;
          };

          if (data.type === "line" && data.kind && typeof data.text === "string") {
            setState((prev) => ({
              ...prev,
              status: data.kind === "error" ? "error" : prev.status,
              lines: [...prev.lines, { kind: data.kind!, text: data.text! }].slice(-MAX_LINES),
            }));
            return;
          }

          if (data.type === "runtime-unavailable") {
            clearTimer();
            if (workerRef.current === worker) cleanupWorker();
            appendMany(
              [
                {
                  kind: "system",
                  text: `⚠ ${data.message ?? "Pyodide is unavailable"}`,
                },
              ],
              "running",
            );
            startRemote(code, language, false);
            return;
          }

          if (data.type === "done") {
            clearTimer();
            if (workerRef.current === worker) cleanupWorker();
            setState((prev) => ({
              ...prev,
              status: prev.status === "error" ? "error" : "complete",
            }));
          }
        };

        worker.onerror = (event) => {
          append({ kind: "error", text: event.message || "The Pyodide worker collapsed." });
          setState((prev) => ({ ...prev, status: "error" }));
          stop();
        };

        timerRef.current = window.setTimeout(() => {
          if (workerRef.current === worker) cleanupWorker();
          appendMany(
            [
              {
                kind: "system",
                text: `⏱ ${PYODIDE_TIMEOUT_MS / 1000}.0s limit reached — the Python worker was terminated; using the server runner.`,
              },
            ],
            "running",
          );
          startRemote(code, language, false);
        }, PYODIDE_TIMEOUT_MS);

        worker.postMessage({ code });
      } catch (error) {
        append({
          kind: "error",
          text: error instanceof Error ? error.message : "This browser refused to open Pyodide.",
        });
        setState((prev) => ({ ...prev, status: "error" }));
        stop();
      }
    },
    [append, appendMany, cleanupWorker, clearTimer, startRemote, stop],
  );

  const runSql = useCallback(
    (code: string, language: RunnerLanguage) => {
      setState({
        status: "running",
        mode: "local",
        exitCode: null,
        lines: [
          { kind: "system", text: "» Executing the SQL ritual in a local in-memory engine…" },
        ],
      });

      const result = executeLocalSql(code);
      if (isSqlFailure(result)) {
        appendMany([{ kind: "error", text: result.error }], "error");
        return;
      }

      const lines: SandboxLine[] = [];
      if (result.columns.length > 0) {
        lines.push({ kind: "result", text: result.columns.join(" | ") });
        for (const row of result.rows) {
          lines.push({ kind: "log", text: row.join(" | ") });
        }
        lines.push({
          kind: "system",
          text: `(${result.rows.length} row${result.rows.length === 1 ? "" : "s"})`,
        });
      } else if (result.message) {
        lines.push({ kind: "log", text: result.message });
      }
      appendMany(lines, "complete");
    },
    [appendMany],
  );

  const run = useCallback(
    (code: string, rawLanguage: string = "javascript") => {
      stop();
      if (code.trim().length === 0) return;

      const language = findLanguage(rawLanguage);
      if (BROWSER_JS.has(language.id)) {
        runJs(code, language);
        return;
      }
      if (language.id === "python") {
        runPython(code, language);
        return;
      }
      if (language.id === "sql") {
        runSql(code, language);
        return;
      }
      startRemote(code, language, true);
    },
    [runJs, runPython, runSql, startRemote, stop],
  );

  /**
   * Refuse a run before anything executes (e.g. a language mismatch) and show
   * the reason in the sandbox output panel.
   */
  const reject = useCallback(
    (lines: SandboxLine[]) => {
      stop();
      setState({ status: "error", mode: null, lines, exitCode: null });
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return {
    status: state.status,
    mode: state.mode,
    lines: state.lines,
    exitCode: state.exitCode,
    run,
    reject,
    clear,
  };
}
