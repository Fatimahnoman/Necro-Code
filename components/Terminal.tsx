"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Download,
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
import { findLanguage } from "@/lib/languages";
import { buildAutopsyReport } from "@/lib/report";
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
  info: "text-slate-300",
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
  same: "border-transparent text-slate-400",
  removed: "border-crimson/50 bg-crimson/10 text-crimson/90",
  added: "border-neon/50 bg-neon/10 text-neon/90",
};

const DIFF_SIGN: Record<DiffLine["kind"], string> = {
  same: " ",
  removed: "-",
  added: "+",
};

const SANDBOX_COLOR: Record<SandboxLineKind, string> = {
  log: "text-slate-300",
  info: "text-spectral",
  warn: "text-amber-300",
  error: "text-crimson",
  debug: "text-slate-400",
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
      <span className="w-7 shrink-0 select-none text-right text-[13px] text-slate-400">
        {line.oldLine ?? ""}
      </span>
      <span className="w-7 shrink-0 select-none text-right text-[13px] text-slate-400">
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

function buildUnitTestSource(finalCode: string): string {
  const functionNames = Array.from(
    finalCode.matchAll(/(?:async\s+function|function)\s+([A-Za-z_$][\w$]*)/g),
    (match) => match[1],
  ).filter((name, index, names) => names.indexOf(name) === index);
  const names = functionNames.length > 0 ? functionNames : ["purified"];
  const assertions = names.map(
    (name) =>
      `assert(typeof api.${name} === "function", ${JSON.stringify(`${name} should exist after purification`)});`,
  );

  return [
    "const assert = (condition, message) => {",
    "  if (!condition) throw new Error(message);",
    "};",
    "const runPurified = async () => {",
    finalCode,
    `return { ${names.join(", ")} };`,
    "};",
    "const api = await runPurified();",
    ...assertions,
  ].join("\n");
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
  onCopied?: () => void;
  onExported?: () => void;
  onSandbox?: () => void;
  autoDemoNonce?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"terminal" | "diff">("terminal");
  const [testStatus, setTestStatus] = useState<
    "idle" | "running" | "passed" | "failed"
  >("idle");
  const runnerLanguage = findLanguage(language);
  const {
    status: sandboxStatus,
    mode: sandboxMode,
    lines: sandboxLines,
    run: runSandbox,
    clear: clearSandbox,
  } = useCodeSandbox();

  useEffect(() => {
    if (view !== "terminal") return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs, view]);

  useEffect(() => {
    clearSandbox();
  }, [finalCode, language, clearSandbox]);

  useEffect(() => {
    if (testStatus !== "running") return;
    if (sandboxStatus === "complete") setTestStatus("passed");
    if (sandboxStatus === "error" || sandboxStatus === "timeout") {
      setTestStatus("failed");
    }
  }, [sandboxStatus, testStatus]);

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

  const handleSandbox = useCallback(() => {
    if (!finalCode) return;
    onSandbox?.();
    runSandbox(finalCode, language);
  }, [finalCode, language, onSandbox, runSandbox]);

  const handleGenerateTest = useCallback(() => {
    if (!finalCode) return;
    setTestStatus("running");
    runSandbox(buildUnitTestSource(finalCode), language);
  }, [finalCode, language, runSandbox]);

  useEffect(() => {
    if (!autoDemoNonce || !finalCode || running || !summary) return;
    setView("diff");
    handleSandbox();
  }, [autoDemoNonce, finalCode, running, summary, handleSandbox]);

  return (
    <aside
      className={`rune-border horror-panel relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-2xl ${
        scanlines ? "scanlines" : ""
      }`}
    >
      <div className="relative z-10 border-b border-white/5 bg-black/55">
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
            <button
              type="button"
              onClick={handleDownload}
              disabled={!hasCode}
              title={hasCode ? "Download purified artifact" : "No artifact yet"}
              className={[
                "grid h-6 w-6 place-items-center rounded-md border transition",
                hasCode
                  ? "border-haunt/40 text-haunt hover:bg-haunt/10"
                  : "cursor-not-allowed border-white/10 text-slate-400",
              ].join(" ")}
            >
              <Download className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-2.5 pb-2">
          <div
            role="tablist"
            aria-label="Terminal view"
            className="flex rounded-md border border-white/10 bg-black/45 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "terminal"}
              onClick={() => setView("terminal")}
              className={[
                "rounded px-2 py-1 font-mono text-[12px] uppercase tracking-[0.2em] transition",
                view === "terminal"
                  ? "bg-spectral/15 text-spectral shadow-[0_0_12px_rgba(6,182,212,0.12)]"
                  : "text-slate-400 hover:text-slate-400",
              ].join(" ")}
            >
              Terminal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "diff"}
              onClick={() => setView("diff")}
              className={[
                "rounded px-2 py-1 font-mono text-[12px] uppercase tracking-[0.2em] transition",
                view === "diff"
                  ? "bg-haunt/15 text-haunt shadow-[0_0_12px_rgba(147,51,234,0.12)]"
                  : "text-slate-400 hover:text-slate-400",
              ].join(" ")}
            >
              Spectral Diff
            </button>
          </div>

          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-slate-400">
            {view === "diff" && canDiff ? (
              <>
                <span className="text-crimson">-{stats.removed}</span>
                <span className="text-neon">+{stats.added}</span>
              </>
            ) : (
              <>
                <span
                  className={`h-1 w-1 rounded-full ${
                    running
                      ? "animate-pulse bg-crimson"
                      : canDiff
                        ? "bg-neon"
                        : "bg-slate-700"
                  }`}
                />
                {canDiff ? "sealed" : "unread"}
              </>
            )}
          </span>
        </div>
      </div>

      {view === "terminal" ? (
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          className="relative z-10 min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed"
        >
          {logs.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <span className="absolute inset-0 animate-[spin_20s_linear_infinite] rounded-full border border-dashed border-haunt/20" />
                <ScrollText className="h-5 w-5 text-haunt/50" aria-hidden />
              </div>
              <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-slate-400">
                The grimoire is empty
              </p>
              <p className="max-w-[230px] font-mono text-[13px] leading-relaxed text-slate-400">
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
      ) : (
        <div
          ref={scrollRef}
          role="region"
          aria-label="Spectral diff"
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
              <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-slate-400">
                {running ? "Spectral diff forming" : "No artifact to compare"}
              </p>
              <p className="max-w-[250px] font-mono text-[13px] leading-relaxed text-slate-400">
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
              <p className="max-w-[240px] font-mono text-[13px] leading-relaxed text-slate-400">
                Original and purified artifacts match line for line.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[12px] uppercase tracking-[0.18em]">
                <span className="text-slate-400">original → purified</span>
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
      )}

      {summary && (
        <div className="relative z-10 border-t border-white/5 bg-black/40 px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.24em] text-slate-400">
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
              <div className="mt-0.5 text-[12px] text-slate-400">cursed</div>
            </div>
            <div className="rounded-md border border-neon/20 bg-neon/5 py-1 text-neon">
              <div className="text-[14px] font-semibold leading-none">
                {summary.fixed}
              </div>
              <div className="mt-0.5 text-[12px] text-slate-400">silenced</div>
            </div>
            <div className="rounded-md border border-haunt/20 bg-haunt/5 py-1 text-haunt">
              <div className="text-[14px] font-semibold leading-none">
                {summary.unresolved}
              </div>
              <div className="mt-0.5 text-[12px] text-slate-400">residual</div>
            </div>
          </div>
        </div>
      )}

      {sandboxStatus !== "idle" && (
        <div
          data-sandbox-output
          data-sandbox-status={sandboxStatus}
          className="relative z-10 border-t border-white/5 bg-black/65"
        >
          <div className="flex items-center gap-2 px-3 py-1.5">
            <SquareTerminal className="h-3 w-3 shrink-0 text-haunt" aria-hidden />
            <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-slate-400">
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
              className="grid h-5 w-5 shrink-0 place-items-center rounded border border-white/10 text-slate-400 transition hover:border-crimson/35 hover:text-crimson"
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          </div>
          <div
            aria-live="polite"
            className="max-h-28 overflow-y-auto overflow-x-hidden px-3 pb-2 font-mono text-[13px] leading-relaxed sm:max-h-36"
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
        </div>
      )}

      {hasCode && (
        <div className="relative z-10 border-t border-white/5 bg-black/50 p-2.5">
          <div className="flex flex-wrap items-stretch gap-1.5">
            <span
              className={[
                "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.18em]",
                testStatus === "passed"
                  ? "border-neon/40 text-neon"
                  : testStatus === "failed"
                    ? "border-crimson/40 text-crimson"
                    : "border-white/10 text-slate-400",
              ].join(" ")}
            >
              {testStatus === "passed" ? "PASS" : testStatus === "failed" ? "FAIL" : "TEST"}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="group relative flex min-w-[120px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-lg border border-neon/40 bg-neon/5 px-2.5 py-2 font-mono text-[13px] uppercase tracking-[0.18em] text-neon transition hover:bg-neon/10 hover:shadow-[0_0_24px_rgba(0,255,102,0.2)]"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span className="truncate">
                {copied ? "Sigil copied" : "Copy purified code"}
              </span>
            </button>
            <button
              type="button"
              onClick={handleGenerateTest}
              disabled={!finalCode || testStatus === "running"}
              title="Generate and run a lightweight purified artifact assertion suite"
              className="group relative flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-spectral/40 bg-spectral/5 px-2.5 py-2 font-mono text-[13px] uppercase tracking-[0.14em] text-spectral transition hover:bg-spectral/10 hover:shadow-[0_0_24px_rgba(6,182,212,0.18)] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-700"
            >
              {testStatus === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <FlaskConical className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="whitespace-nowrap">
                {testStatus === "running" ? "Testing" : "GEN TEST"}
              </span>
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
              className="group relative flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-haunt/40 bg-haunt/5 px-2.5 py-2 font-mono text-[13px] uppercase tracking-[0.14em] text-haunt transition hover:bg-haunt/10 hover:shadow-[0_0_24px_rgba(147,51,234,0.18)] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-700"
            >
              {sandboxStatus === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span className="whitespace-nowrap">Test sandbox</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={originalCode === null}
              title={
                originalCode === null
                  ? "The autopsy is sealed until the ritual completes"
                  : "Download the exorcism autopsy report"
              }
              className="group relative flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-spectral/40 bg-spectral/5 px-2.5 py-2 font-mono text-[13px] uppercase tracking-[0.14em] text-spectral transition hover:bg-spectral/10 hover:shadow-[0_0_24px_rgba(6,182,212,0.18)] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-700"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">Export report</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
