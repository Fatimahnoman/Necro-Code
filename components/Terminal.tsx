"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Download,
  FileDiff,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  ScrollText,
  SquareTerminal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  diffLines,
  diffStats,
  type DiffLine,
} from "@/lib/diff";
import { checkRuntimeMatch, findLanguage } from "@/lib/languages";
import {
  buildAutopsyReport,
  buildUnifiedPatch,
  HEALTH_WEIGHTS,
  type HealthTier,
  healthTier,
  patchPath,
} from "@/lib/report";
import {
  buildSmokeHarness,
  type SmokeHarness,
  smokeLabel,
  smokePassed,
} from "@/lib/smokeTest";
import {
  type SandboxLineKind,
  useCodeSandbox,
} from "@/lib/useCodeSandbox";
import type {
  AgentEvent,
  AppliedFix,
  BugFinding,
  EngineInfo,
  ExorcismSummary,
  LogLevel,
} from "@/lib/types";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "text-zinc-200",
  success: "text-neon text-glow-neon",
  warn: "text-amber-300",
  error: "text-crimson text-glow-crimson",
  system: "text-spectral",
  code: "text-haunt/80",
};

const LEVEL_GLYPH: Record<LogLevel, string> = {
  info: "·",
  success: "✓",
  warn: "!",
  error: "✗",
  system: "›",
  code: "│",
};

const DIFF_ROW: Record<DiffLine["kind"], string> = {
  same: "border-transparent text-zinc-300",
  removed: "border-crimson/50 bg-crimson/10 text-crimson/90",
  added: "border-neon/50 bg-neon/10 text-neon/90",
};

const DIFF_SIGN: Record<DiffLine["kind"], string> = {
  same: " ",
  removed: "-",
  added: "+",
};

const HEALTH_COLOR: Record<HealthTier, string> = {
  cursed: "text-crimson",
  haunted: "text-amber-300",
  pure: "text-neon",
};

const HEALTH_BORDER: Record<HealthTier, string> = {
  cursed: "border-crimson/40 shadow-[0_0_12px_rgba(255,0,60,0.18)]",
  haunted: "border-amber-300/40 shadow-[0_0_12px_rgba(252,211,77,0.14)]",
  pure: "border-neon/40 shadow-[0_0_12px_rgba(0,255,102,0.16)]",
};

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Uniform pinned-toolbar button: single line, never shrinks or truncates. */
const ACTION_BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 font-mono text-[12px] font-medium uppercase leading-none tracking-[0.08em] transition disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-500 disabled:shadow-none";

type GrimoireTab = "logs" | "diff" | "sandbox";

const GRIMOIRE_TABS: Array<{ id: GrimoireTab; label: string }> = [
  { id: "logs", label: "Logs" },
  { id: "diff", label: "Spectral Diff" },
  { id: "sandbox", label: "Sandbox" },
];

const TAB_SELECTED: Record<GrimoireTab, string> = {
  logs: "border-spectral/50 bg-spectral/15 text-spectral shadow-[0_0_12px_rgba(6,182,212,0.14)]",
  diff: "border-haunt/50 bg-haunt/15 text-haunt-glow shadow-[0_0_12px_rgba(147,51,234,0.14)]",
  sandbox: "border-neon/45 bg-neon/10 text-neon shadow-[0_0_12px_rgba(0,255,102,0.12)]",
};

const SANDBOX_DOT: Record<"running" | "complete" | "error" | "timeout", string> = {
  running: "animate-pulse bg-haunt-glow",
  complete: "bg-neon shadow-[0_0_8px_rgba(0,255,102,0.9)]",
  error: "bg-crimson shadow-[0_0_8px_rgba(255,0,60,0.9)]",
  timeout: "bg-amber-300",
};

const SANDBOX_COLOR: Record<SandboxLineKind, string> = {
  log: "text-zinc-200",
  info: "text-spectral",
  warn: "text-amber-300",
  error: "text-crimson",
  debug: "text-zinc-300",
  result: "text-neon",
  system: "text-haunt/80",
};

const SANDBOX_GLYPH: Record<SandboxLineKind, string> = {
  log: "›",
  info: "i",
  warn: "!",
  error: "✗",
  debug: "·",
  result: "←",
  system: "◆",
};

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div
      data-diff-kind={line.kind}
      className={`flex gap-1.5 border-l-2 px-1 py-0.5 ${DIFF_ROW[line.kind]}`}
    >
      <span className="w-7 shrink-0 select-none text-right text-[13px] text-zinc-300">
        {line.oldLine ?? ""}
      </span>
      <span className="w-7 shrink-0 select-none text-right text-[13px] text-zinc-300">
        {line.newLine ?? ""}
      </span>
      <span className="w-2.5 shrink-0 select-none text-center font-bold">
        {DIFF_SIGN[line.kind]}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words">
        {line.text.length > 0 ? line.text : " "}
      </span>
    </div>
  );
}

export function Terminal({
  logs,
  running,
  scanlines = true,
  summary,
  finalCode,
  originalCode,
  findings,
  appliedFixes,
  engine,
  language,
  filename,
  onCopied,
  onExported,
  onSandbox,
  autoDemoNonce,
}: {
  logs: AgentEvent[];
  running: boolean;
  scanlines?: boolean;
  summary: ExorcismSummary | null;
  finalCode: string | null;
  originalCode: string | null;
  findings: BugFinding[];
  appliedFixes: AppliedFix[];
  engine: EngineInfo;
  language: string;
  /** Editor filename or GitHub repo path; used as the patch target path. */
  filename: string;
  onCopied?: () => void;
  onExported?: () => void;
  onSandbox?: () => void;
  autoDemoNonce?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<GrimoireTab>("logs");
  const [testStatus, setTestStatus] = useState<
    "idle" | "running" | "passed" | "failed"
  >("idle");
  const [testHarness, setTestHarness] = useState<SmokeHarness | null>(null);
  const runnerLanguage = findLanguage(language);
  const {
    status: sandboxStatus,
    mode: sandboxMode,
    lines: sandboxLines,
    exitCode: sandboxExitCode,
    run: runSandbox,
    reject: rejectSandbox,
    clear: clearSandbox,
  } = useCodeSandbox();

  useEffect(() => {
    if (view !== "logs") return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs, view]);

  useEffect(() => {
    clearSandbox();
    setTestStatus("idle");
    setTestHarness(null);
  }, [finalCode, language, clearSandbox]);

  useEffect(() => {
    if (testStatus !== "running" || !testHarness) return;
    if (sandboxStatus === "idle" || sandboxStatus === "running") return;
    const passed = smokePassed(testHarness, {
      status: sandboxStatus,
      exitCode: sandboxExitCode,
      local: sandboxMode === "local",
      stdoutLines: sandboxLines
        .filter((line) => line.kind === "log")
        .map((line) => line.text),
    });
    setTestStatus(passed ? "passed" : "failed");
  }, [
    sandboxExitCode,
    sandboxLines,
    sandboxMode,
    sandboxStatus,
    testHarness,
    testStatus,
  ]);

  const streamedCode = logs
    .filter((log) => log.level === "code")
    .map((log) => log.message);
  const codeText = finalCode ?? streamedCode.join("\n");
  const hasCode = codeText.trim().length > 0;

  const diff = useMemo(
    () =>
      originalCode !== null && finalCode !== null
        ? diffLines(originalCode, finalCode)
        : [],
    [originalCode, finalCode],
  );
  const stats = useMemo(() => diffStats(diff), [diff]);
  const canDiff = originalCode !== null && finalCode !== null;
  const hasChanges = stats.added > 0 || stats.removed > 0;

  const handleCopy = useCallback(async () => {
    if (!hasCode) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codeText);
      } else {
        const area = document.createElement("textarea");
        area.value = codeText;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — the rite simply fails silently.
    }
  }, [codeText, hasCode, onCopied]);

  const handleDownload = useCallback(() => {
    if (!hasCode) return;
    const blob = new Blob([codeText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "purified-artifact.ts";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [codeText, hasCode]);

  const handleExport = useCallback(() => {
    if (!hasCode || originalCode === null) return;
    const report = buildAutopsyReport({
      originalCode,
      purifiedCode: codeText,
      findings,
      appliedFixes,
      summary,
      engine,
      logs,
      language,
    });
    const blob = new Blob([report], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "necrocode-exorcism-report.md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    onExported?.();
  }, [
    appliedFixes,
    codeText,
    engine,
    findings,
    hasCode,
    language,
    logs,
    onExported,
    originalCode,
    summary,
  ]);

  const patch = useMemo(
    () =>
      originalCode !== null && finalCode !== null
        ? buildUnifiedPatch(
            originalCode,
            finalCode,
            patchPath(filename, runnerLanguage.extension),
          )
        : null,
    [filename, finalCode, originalCode, runnerLanguage.extension],
  );

  const handlePatch = useCallback(() => {
    if (!patch) return;
    downloadText(patch, "necrocode-fix.patch", "text/x-diff;charset=utf-8");
    onExported?.();
  }, [onExported, patch]);

  const healthBefore = summary?.healthBefore;
  const healthAfter = summary?.healthAfter;

  /** Pre-flight: block a run whose code clearly belongs to another runtime. */
  const preflight = useCallback(
    (code: string): boolean => {
      const match = checkRuntimeMatch(code, language);
      if (match.ok) return true;
      rejectSandbox([
        { kind: "warn", text: match.message },
        {
          kind: "system",
          text: `» Detected ${match.detected.label} (signature score ${match.detected.score}). Nothing was executed.`,
        },
      ]);
      return false;
    },
    [language, rejectSandbox],
  );

  const startSandbox = useCallback(
    (switchView: boolean) => {
      if (!finalCode) return;
      onSandbox?.();
      if (switchView) setView("sandbox");
      // A plain sandbox run must not be graded as a pending GEN TEST.
      setTestStatus((status) => (status === "running" ? "idle" : status));
      if (!preflight(finalCode)) return;
      runSandbox(finalCode, language);
    },
    [finalCode, language, onSandbox, preflight, runSandbox],
  );

  const handleSandbox = useCallback(() => startSandbox(true), [startSandbox]);

  const handleGenerateTest = useCallback(() => {
    if (!finalCode) return;
    setView("sandbox");
    if (!preflight(finalCode)) {
      setTestStatus("idle");
      setTestHarness(null);
      return;
    }
    const harness = buildSmokeHarness(finalCode, language);
    setTestHarness(harness);
    setTestStatus("running");
    runSandbox(harness.source, language);
  }, [finalCode, language, preflight, runSandbox]);

  useEffect(() => {
    if (!autoDemoNonce || !finalCode || running || !summary) return;
    // AUTO DEMO shows the diff; the sandbox runs alongside and its tab badge lights up.
    setView("diff");
    startSandbox(false);
  }, [autoDemoNonce, finalCode, running, summary, startSandbox]);

  // A new ritual always starts on the live log.
  useEffect(() => {
    if (running) setView("logs");
  }, [running]);

  return (
    <aside
      className={`rune-border horror-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl ${
        scanlines ? "scanlines" : ""
      }`}
    >
      {/* Header + pinned action toolbar + tabs: never scroll. */}
      <div className="relative z-30 shrink-0 border-b border-white/10 bg-[#0a0b14]/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-crimson shadow-[0_0_8px_rgba(255,0,60,0.8)]" />
            <span className="h-2 w-2 rounded-full bg-haunt/80" />
            <span className="h-2 w-2 rounded-full bg-neon/70" />
          </div>
          <div className="ml-1 flex min-w-0 items-center gap-1.5">
            <SquareTerminal
              className="h-3.5 w-3.5 shrink-0 text-spectral"
              aria-hidden
            />
            <span className="truncate font-mono text-xs font-bold uppercase tracking-[0.15em] text-white">
              Grimoire Terminal
            </span>
          </div>

          {running && (
            <span className="ml-1 inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.2em] text-crimson">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-crimson" />
              live
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {healthBefore !== undefined && healthAfter !== undefined && (
              <span
                data-health-before={healthBefore}
                data-health-after={healthAfter}
                title={`Code Health & Security Score before → after exorcism. 100 minus ${HEALTH_WEIGHTS.critical} per critical, ${HEALTH_WEIGHTS.warning} per warning, ${HEALTH_WEIGHTS.info} per info finding.`}
                aria-label={`Health score ${healthBefore} out of 100 before, ${healthAfter} out of 100 after`}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border bg-black/50 px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.08em] ${HEALTH_BORDER[healthTier(healthAfter)]}`}
              >
                <span className={HEALTH_COLOR[healthTier(healthBefore)]}>
                  {healthBefore}
                </span>
                <span className="text-zinc-400">→</span>
                <span className={`font-bold ${HEALTH_COLOR[healthTier(healthAfter)]}`}>
                  {healthAfter}
                </span>
                <span className="text-zinc-400">/100</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleDownload}
              disabled={!hasCode}
              title={hasCode ? "Download purified artifact" : "No artifact yet"}
              className={[
                "grid h-6 w-6 place-items-center rounded-md border transition",
                hasCode
                  ? "border-haunt/40 text-haunt hover:bg-haunt/10"
                  : "cursor-not-allowed border-white/10 text-zinc-300",
              ].join(" ")}
            >
              <Download className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>


        <div data-terminal-actions className="px-2.5 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleGenerateTest}
            disabled={!finalCode || testStatus === "running"}
            title={
              runnerLanguage.id === "python" ||
              runnerLanguage.id === "javascript" ||
              runnerLanguage.id === "typescript" ||
              runnerLanguage.id === "tsx"
                ? `Generate and run a native ${runnerLanguage.label} assertion suite for the purified functions`
                : `Run a ${runnerLanguage.label} smoke check: passes when the purified artifact exits with code 0`
            }
            className={`${ACTION_BUTTON} border-spectral/45 bg-spectral/10 text-spectral hover:bg-spectral/15 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]`}
          >
            {testStatus === "running" ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {testStatus === "running" ? "Testing" : "Gen test"}
          </button>
          <button
            type="button"
            onClick={handleSandbox}
            disabled={!finalCode || sandboxStatus === "running"}
            title={
              finalCode
                ? runnerLanguage.local
                  ? "Run the purified JavaScript in a 2-second sandboxed Web Worker"
                  : `Run the purified ${runnerLanguage.label} on the remote 25-second sandbox`
                : "The sandbox is sealed until the purified artifact arrives"
            }
            className={`${ACTION_BUTTON} border-haunt/45 bg-haunt/10 text-haunt-glow hover:bg-haunt/15 hover:shadow-[0_0_20px_rgba(147,51,234,0.22)]`}
          >
            {sandboxStatus === "running" ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            Test sandbox
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasCode}
            title={hasCode ? "Copy the purified artifact" : "No artifact yet"}
            className={`${ACTION_BUTTON} border-neon/45 bg-neon/10 text-neon hover:bg-neon/15 hover:shadow-[0_0_20px_rgba(0,255,102,0.2)]`}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasCode || originalCode === null}
            title={
              originalCode === null
                ? "The autopsy is sealed until the ritual completes"
                : "Download the exorcism autopsy report"
            }
            className={`${ACTION_BUTTON} border-spectral/45 bg-spectral/10 text-zinc-100 hover:bg-spectral/15 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-spectral" aria-hidden />
            Report
          </button>
          <button
            type="button"
            onClick={handlePatch}
            disabled={!patch}
            title={
              patch
                ? `Download necrocode-fix.patch for ${patchPath(filename, runnerLanguage.extension)} — apply with: git apply necrocode-fix.patch`
                : originalCode === null
                  ? "The patch is sealed until the ritual completes"
                  : "No changes to patch"
            }
            className={`${ACTION_BUTTON} border-neon/45 bg-neon/10 text-neon hover:bg-neon/15 hover:shadow-[0_0_20px_rgba(0,255,102,0.2)]`}
          >
            <FileDiff className="h-3.5 w-3.5 shrink-0" aria-hidden />
            .patch
          </button>
          <span
            aria-live="polite"
            className={[
              "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 font-mono text-[12px] font-medium uppercase leading-none tracking-[0.08em]",
              testStatus === "passed"
                ? "border-neon/50 bg-neon/10 text-neon"
                : testStatus === "failed"
                  ? "border-crimson/50 bg-crimson/10 text-crimson"
                  : "border-white/15 text-zinc-300",
            ].join(" ")}
          >
            {testHarness && (testStatus === "passed" || testStatus === "failed")
              ? smokeLabel(testHarness, testStatus === "passed")
              : testStatus === "running"
                ? "…"
                : "Test"}
          </span>
        </div>
        </div>

        <div
          role="tablist"
          aria-label="Grimoire view"
          className="flex items-center gap-1 px-2.5 pb-2 pt-1"
        >
          {GRIMOIRE_TABS.map((tab) => {
            const selected = view === tab.id;
            const badge =
              tab.id === "diff" && canDiff ? (
                <span className="flex items-center gap-1 text-[12px] normal-case tracking-normal">
                  <span className="text-crimson">-{stats.removed}</span>
                  <span className="text-neon">+{stats.added}</span>
                </span>
              ) : tab.id === "sandbox" && sandboxStatus !== "idle" ? (
                <span
                  data-sandbox-badge={sandboxStatus}
                  aria-label={`sandbox ${sandboxStatus}`}
                  className={`h-2 w-2 shrink-0 rounded-full ${SANDBOX_DOT[sandboxStatus]}`}
                />
              ) : tab.id === "logs" && running ? (
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-crimson" />
              ) : null;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`grimoire-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls="grimoire-panel"
                onClick={() => setView(tab.id)}
                className={[
                  "inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 font-mono text-[12px] font-medium uppercase leading-none tracking-[0.1em] transition",
                  selected
                    ? TAB_SELECTED[tab.id]
                    : "border-white/10 bg-black/40 text-zinc-300 hover:border-white/25 hover:text-white",
                ].join(" ")}
              >
                {tab.label}
                {badge}
              </button>
            );
          })}
        </div>
      </div>

      {view === "logs" ? (
        <div
          ref={scrollRef}
          id="grimoire-panel"
          role="log"
          aria-live="polite"
          aria-labelledby="grimoire-tab-logs"
          className="relative z-10 min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed"
        >
          {logs.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <span className="absolute inset-0 animate-[spin_20s_linear_infinite] rounded-full border border-dashed border-haunt/20" />
                <ScrollText className="h-5 w-5 text-haunt/50" aria-hidden />
              </div>
              <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-zinc-300">
                The grimoire is empty
              </p>
              <p className="max-w-[230px] font-mono text-[13px] leading-relaxed text-zinc-300">
                Offer a cursed artifact and press{" "}
                <span className="text-crimson">Exorcise Code</span> to begin the
                séance.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={`${log.seq}-${log.ts}`}
                initial={{ opacity: 0, x: -7 }}
                animate={{ opacity: 1, x: 0 }}
                className={
                  log.level === "code"
                    ? "my-0.5 border-l border-haunt/20 pl-2 whitespace-pre-wrap break-words text-haunt/70"
                    : "flex gap-2 py-0.5"
                }
              >
                {log.level !== "code" && (
                  <span
                    className={`w-2 shrink-0 select-none ${LEVEL_COLOR[log.level]}`}
                  >
                    {LEVEL_GLYPH[log.level]}
                  </span>
                )}
                <span
                  className={`min-w-0 whitespace-pre-wrap break-words ${
                    log.level === "code" ? "" : LEVEL_COLOR[log.level]
                  }`}
                >
                  {log.message}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {running && (
            <div className="flex gap-2 py-1">
              <span className="text-crimson">›</span>
              <motion.span
                className="inline-block h-3.5 w-1.5 bg-crimson shadow-[0_0_12px_rgba(255,0,60,0.8)]"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.85, repeat: Infinity }}
              />
            </div>
          )}
        </div>
      ) : view === "diff" ? (
        <div
          ref={scrollRef}
          id="grimoire-panel"
          role="tabpanel"
          aria-labelledby="grimoire-tab-diff"
          className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 font-mono text-[13px] leading-relaxed"
        >
          {!canDiff ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <span
                  className={`absolute inset-0 rounded-full border border-dashed border-haunt/25 ${
                    running ? "animate-[spin_8s_linear_infinite]" : ""
                  }`}
                />
                <FileText className="h-5 w-5 text-haunt/50" aria-hidden />
              </div>
              <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-zinc-300">
                {running ? "Spectral diff forming" : "No artifact to compare"}
              </p>
              <p className="max-w-[250px] font-mono text-[13px] leading-relaxed text-zinc-300">
                {running
                  ? "The purified artifact is still being transcribed. The diff will appear when the final seal is drawn."
                  : "Exorcise a cursed artifact to reveal every line the ritual changed."}
              </p>
            </div>
          ) : !hasChanges ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border border-neon/25 bg-neon/5">
                <Check className="h-5 w-5 text-neon" aria-hidden />
              </div>
              <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-neon/80">
                No spectral residue
              </p>
              <p className="max-w-[240px] font-mono text-[13px] leading-relaxed text-zinc-300">
                Original and purified artifacts match line for line.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[12px] uppercase tracking-[0.18em]">
                <span className="text-zinc-300">original → purified</span>
                <span className="flex items-center gap-2">
                  <span className="text-crimson">-{stats.removed} removed</span>
                  <span className="text-neon">+{stats.added} added</span>
                </span>
              </div>
              <div className="space-y-px">
                {diff.map((line, index) => (
                  <DiffRow
                    key={`${line.kind}-${line.oldLine ?? "x"}-${
                      line.newLine ?? "x"
                    }-${index}`}
                    line={line}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div
          id="grimoire-panel"
          role="tabpanel"
          aria-labelledby="grimoire-tab-sandbox"
          data-sandbox-output
          data-sandbox-status={sandboxStatus}
          className="relative z-10 flex min-h-0 flex-1 flex-col"
        >
          {sandboxStatus === "idle" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <span className="absolute inset-0 rounded-full border border-dashed border-haunt/25" />
                <Play className="h-5 w-5 text-haunt/60" aria-hidden />
              </div>
              <p className="font-mono text-[13px] uppercase tracking-[0.2em] text-zinc-200">
                Sandbox is sealed
              </p>
              <p className="max-w-[260px] font-mono text-[13px] leading-relaxed text-zinc-400">
                {finalCode
                  ? "Click TEST SANDBOX or GEN TEST to run the purified artifact."
                  : "Exorcise an artifact first, then run it here."}
              </p>
            </div>
          ) : (
            <>
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
            <SquareTerminal className="h-3 w-3 shrink-0 text-haunt" aria-hidden />
            <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-zinc-300">
              Sandbox output
            </span>
            {sandboxMode && (
              <span
                title={
                  sandboxMode === "remote"
                    ? `${runnerLanguage.label} runs on the remote Paiza.IO pyre`
                    : `${runnerLanguage.label} runs in the local Web Worker`
                }
                className={`rounded border px-1 py-0.5 font-mono text-[12px] uppercase tracking-[0.16em] ${
                  sandboxMode === "remote"
                    ? "border-spectral/30 text-spectral/80"
                    : "border-haunt/30 text-haunt/80"
                }`}
              >
                {sandboxMode === "remote" ? "remote" : "local"}
              </span>
            )}
            <span
              className={`ml-auto inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.18em] ${
                sandboxStatus === "running"
                  ? "text-haunt"
                  : sandboxStatus === "complete"
                    ? "text-neon"
                    : sandboxStatus === "timeout"
                      ? "text-amber-300"
                      : "text-crimson"
              }`}
            >
              {sandboxStatus === "running" && (
                <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
              )}
              {sandboxStatus}
            </span>
            <button
              type="button"
              onClick={clearSandbox}
              aria-label="Clear sandbox output"
              className="grid h-5 w-5 shrink-0 place-items-center rounded border border-white/10 text-zinc-300 transition hover:border-crimson/35 hover:text-crimson"
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          </div>
              <div
                aria-live="polite"
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[13px] leading-relaxed"
              >
            {sandboxLines.map((line, index) => (
              <div
                key={`${line.kind}-${index}`}
                className="flex gap-1.5 whitespace-pre-wrap break-words"
              >
                <span
                  className={`w-2 shrink-0 select-none ${SANDBOX_COLOR[line.kind]}`}
                >
                  {SANDBOX_GLYPH[line.kind]}
                </span>
                <span className={`min-w-0 ${SANDBOX_COLOR[line.kind]}`}>
                  {line.text}
                </span>
              </div>
            ))}
            {sandboxStatus === "running" && (
              <div className="flex gap-1.5 py-0.5">
                <span className="w-2 shrink-0 text-haunt">›</span>
                <span className="inline-block h-3 w-1.5 animate-pulse bg-haunt" />
              </div>
            )}
              </div>
            </>
          )}
        </div>
      )}

      {summary && (
        <div className="relative z-10 border-t border-white/5 bg-black/40 px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.24em] text-zinc-300">
            <span>Corruption report</span>
            <span className={summary.unresolved > 0 ? "text-crimson" : "text-neon"}>
              {summary.unresolved > 0 ? "residual" : "purified"}
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center font-mono uppercase tracking-[0.14em]">
            <div className="rounded-md border border-crimson/20 bg-crimson/5 py-1 text-crimson">
              <div className="text-[14px] font-semibold leading-none">
                {summary.detected}
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-300">cursed</div>
            </div>
            <div className="rounded-md border border-neon/20 bg-neon/5 py-1 text-neon">
              <div className="text-[14px] font-semibold leading-none">
                {summary.fixed}
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-300">silenced</div>
            </div>
            <div className="rounded-md border border-haunt/20 bg-haunt/5 py-1 text-haunt">
              <div className="text-[14px] font-semibold leading-none">
                {summary.unresolved}
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-300">residual</div>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
}
