"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findLanguage } from "@/lib/languages";
import type { RemoteRunResult } from "@/lib/runner";

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

const TIMEOUT_MS = 2_000;
const REMOTE_TIMEOUT_MS = 25_000;
const MAX_LINES = 80;

const WORKER_SOURCE = String.raw`
const formatValue = (value, depth, seen) => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "number" || type === "boolean" || type === "bigint") {
    return String(value);
  }
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

const formatArgument = (value) => {
  return typeof value === "string" ? value : formatValue(value);
};

const emit = (kind, args) => {
  self.postMessage({
    type: "line",
    kind,
    text: args.map((value) => formatArgument(value)).join(" "),
  });
};

console.log = (...args) => emit("log", args);
console.info = (...args) => emit("info", args);
console.warn = (...args) => emit("warn", args);
console.error = (...args) => emit("error", args);
console.debug = (...args) => emit("debug", args);

const seal = (name) => {
  try {
    Object.defineProperty(self, name, {
      value: () => {
        throw new Error(name + " is sealed inside the NecroCode sandbox.");
      },
      configurable: false,
      writable: false,
    });
  } catch {
    // Some runtimes expose non-configurable globals; the Worker boundary still holds.
  }
};

["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts"].forEach(seal);

self.onmessage = async (event) => {
  const code = event && event.data && event.data.code;
  if (typeof code !== "string") {
    self.postMessage({ type: "done" });
    return;
  }

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const body = [
      '"use strict";',
      "const process = { argv: [\"node\", \"artifact.js\", \"1\"], env: {} };",
      "const module = { exports: {} };",
      "const exports = {};",
      code,
      "//# sourceURL=necrocode-purified.js",
    ].join("\n");
    const fn = new AsyncFunction(body);
    const result = await fn();
    if (result !== undefined) {
      self.postMessage({
        type: "line",
        kind: "result",
        text: formatValue(result),
      });
    }
    self.postMessage({ type: "done" });
  } catch (error) {
    self.postMessage({
      type: "line",
      kind: "error",
      text: formatValue(error),
    });
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
  if (text.length === 0) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\s+$/, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
}

export function useCodeSandbox() {
  const workerRef = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const remoteAbortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<SandboxState>(IDLE);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    remoteAbortRef.current?.abort();
    remoteAbortRef.current = null;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

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

  const run = useCallback(
    (code: string, rawLanguage: string = "javascript") => {
      stop();
      if (code.trim().length === 0) return;

      const language = findLanguage(rawLanguage);

      if (language.local) {
        setState({
          status: "running",
          mode: "local",
          exitCode: null,
          lines: [
            {
              kind: "system",
              text: "» Sealing the purified JavaScript artifact inside an isolated Web Worker…",
            },
          ],
        });

        try {
          const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
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

            if (
              data.type === "line" &&
              data.kind &&
              typeof data.text === "string"
            ) {
              setState((prev) => ({
                ...prev,
                status: data.kind === "error" ? "error" : prev.status,
                lines: [
                  ...prev.lines,
                  { kind: data.kind as SandboxLineKind, text: data.text as string },
                ].slice(-MAX_LINES),
              }));
              return;
            }

            if (data.type === "done") {
              if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
              }
              setState((prev) => ({
                ...prev,
                status: prev.status === "error" ? "error" : "complete",
              }));
              if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
              }
              if (urlRef.current) {
                URL.revokeObjectURL(urlRef.current);
                urlRef.current = null;
              }
            }
          };

          worker.onerror = (event) => {
            append({
              kind: "error",
              text: event.message || "The sandbox worker collapsed.",
            });
            setState((prev) => ({ ...prev, status: "error" }));
            stop();
          };

          timerRef.current = window.setTimeout(() => {
            append({
              kind: "system",
              text: "⏱ 2.0s limit reached — the worker was terminated.",
            });
            setState((prev) => ({ ...prev, status: "timeout" }));
            stop();
          }, TIMEOUT_MS);

          worker.postMessage({ code });
        } catch (error) {
          append({
            kind: "error",
            text:
              error instanceof Error
                ? error.message
                : "This browser refused to open the sandbox.",
          });
          setState((prev) => ({ ...prev, status: "error" }));
          stop();
        }

        return;
      }

      setState({
        status: "running",
        mode: "remote",
        exitCode: null,
        lines: [
          {
            kind: "system",
            text: `» Sending the purified ${language.label} artifact to the remote pyre…`,
          },
          ...(language.note
            ? [{ kind: "system" as SandboxLineKind, text: `⚠ ${language.note}` }]
            : []),
          {
            kind: "system",
            text: "⚠ Remote runner: the artifact leaves this browser and is executed by Paiza.IO.",
          },
        ],
      });

      const controller = new AbortController();
      remoteAbortRef.current = controller;

      timerRef.current = window.setTimeout(() => {
        controller.abort();
        appendMany(
          [
            {
              kind: "system",
              text: "⏱ 25.0s remote limit reached — the run was abandoned.",
            },
          ],
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

          const payload = (await response.json().catch(() => ({}))) as
            Partial<RemoteRunResult>;

          if (!response.ok && !payload.message) {
            throw new Error(
              `The remote pyre rejected the artifact (HTTP ${response.status}).`,
            );
          }

          const lines: SandboxLine[] = [];
          const buildLines = splitOutput(payload.build ?? "");
          const stdoutLines = splitOutput(payload.stdout ?? "");
          const stderrLines = splitOutput(payload.stderr ?? "");

          if (buildLines.length > 0) {
            lines.push(
              ...buildLines.map((text) => ({
                kind: (payload.ok ? "warn" : "error") as SandboxLineKind,
                text,
              })),
            );
          }
          if (stdoutLines.length > 0) {
            lines.push(
              ...stdoutLines.map((text) => ({
                kind: "log" as SandboxLineKind,
                text,
              })),
            );
          }
          if (stderrLines.length > 0) {
            lines.push(
              ...stderrLines.map((text) => ({
                kind: "error" as SandboxLineKind,
                text,
              })),
            );
          }

          if (payload.exitCode !== null && payload.exitCode !== undefined) {
            lines.push({
              kind: "system",
              text: `» exit ${payload.exitCode}${
                payload.duration ? ` · ${payload.duration}s` : ""
              }`,
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
              text: `✗ ${payload.languageLabel ?? language.label} run failed`,
            });
          }

          if (payload.ok) {
            lines.push({
              kind: "result",
              text: `✓ ${payload.languageLabel ?? language.label} run complete`,
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
                text:
                  error instanceof Error
                    ? error.message
                    : "The remote pyre did not answer.",
              },
            ],
            "error",
          );
        } finally {
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          if (remoteAbortRef.current === controller) {
            remoteAbortRef.current = null;
          }
        }
      })();
    },
    [append, appendMany, stop],
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
