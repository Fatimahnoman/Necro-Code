"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, FileText, FlaskConical, Loader2, Play, ScrollText, SquareTerminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXPORT_ICONS, ExportMenu, type ExportMenuItem } from "@/components/ExportMenu";
import { diffLines, diffStats, type DiffLine } from "@/lib/diff";
import { checkRuntimeMatch, findLanguage } from "@/lib/languages";
import { buildAutopsyReport, buildUnifiedPatch, HEALTH_WEIGHTS, type HealthTier, healthTier, patchPath } from "@/lib/report";
import { buildSmokeHarness, type SmokeHarness, smokeLabel, smokePassed } from "@/lib/smokeTest";
import { type SandboxLineKind, useCodeSandbox } from "@/lib/useCodeSandbox";
import type { AgentEvent, AppliedFix, BugFinding, EngineInfo, ExorcismSummary, LogLevel } from "@/lib/types";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "text-zinc-200", success: "text-neon text-glow-neon", warn: "text-amber-300",
  error: "text-crimson text-glow-crimson", system: "text-spectral", code: "text-haunt/80",
};
const LEVEL_GLYPH: Record<LogLevel, string> = { info: "·", success: "✓", warn: "!", error: "✗", system: "›", code: "│" };
const DIFF_ROW: Record<DiffLine["kind"], string> = {
  same: "border-transparent text-zinc-300", removed: "border-crimson/50 bg-crimson/10 text-crimson/90", added: "border-neon/50 bg-neon/10 text-neon/90",
};
const DIFF_SIGN: Record<DiffLine["kind"], string> = { same: " ", removed: "-", added: "+" };
const HEALTH_COLOR: Record<HealthTier, string> = { cursed: "text-crimson", haunted: "text-amber-300", pure: "text-neon" };
const HEALTH_BORDER: Record<HealthTier, string> = {
  cursed: "border-crimson/40 shadow-[0_0_12px_rgba(255,0,60,0.18)]",
  haunted: "border-amber-300/40 shadow-[0_0_12px_rgba(252,211,77,0.14)]",
  pure: "border-neon/40 shadow-[0_0_12px_rgba(0,255,102,0.16)]",
};
function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}
const ACTION_BUTTON = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 font-sans text-[12px] font-semibold uppercase leading-none tracking-[0.08em] transition disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-500 disabled:shadow-none";
type GrimoireTab = "logs" | "diff" | "sandbox";
const GRIMOIRE_TABS: Array<{ id: GrimoireTab; label: string }> = [{ id: "logs", label: "Logs" }, { id: "diff", label: "Spectral Diff" }, { id: "sandbox", label: "Sandbox" }];
const TAB_SELECTED: Record<GrimoireTab, string> = {
  logs: "border-spectral/50 bg-spectral/15 text-spectral",
  diff: "border-haunt/50 bg-haunt/15 text-haunt-glow",
  sandbox: "border-neon/45 bg-neon/10 text-neon",
};
const SANDBOX_DOT: Record<"running" | "complete" | "error" | "timeout", string> = { running: "animate-pulse bg-haunt-glow", complete: "bg-neon", error: "bg-crimson", timeout: "bg-amber-300" };
const SANDBOX_COLOR: Record<SandboxLineKind, string> = { log: "text-zinc-200", info: "text-spectral", warn: "text-amber-300", error: "text-crimson", debug: "text-zinc-300", result: "text-neon", system: "text-haunt/80" };
const SANDBOX_GLYPH: Record<SandboxLineKind, string> = { log: "›", info: "i", warn: "!", error: "✗", debug: "·", result: "←", system: "◆" };
function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div data-diff-kind={line.kind} className={`flex gap-1.5 border-l-2 px-1 py-0.5 ${DIFF_ROW[line.kind]}`}>
      <span className="w-7 shrink-0 select-none text-right text-[12px] text-zinc-400">{line.oldLine ?? ""}</span>
      <span className="w-7 shrink-0 select-none text-right text-[12px] text-zinc-400">{line.newLine ?? ""}</span>
      <span className="w-2.5 shrink-0 select-none text-center font-bold">{DIFF_SIGN[line.kind]}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{line.text.length > 0 ? line.text : " "}</span>
    </div>
  );
}

export function Terminal({ logs, running, scanlines = true, summary, finalCode, originalCode, findings, appliedFixes, engine, language, filename, onCopied, onExported, onSandbox, autoDemoNonce }: {
  logs: AgentEvent[]; running: boolean; scanlines?: boolean; summary: ExorcismSummary | null; finalCode: string | null; originalCode: string | null;
  findings: BugFinding[]; appliedFixes: AppliedFix[]; engine: EngineInfo; language: string; filename: string;
  onCopied?: () => void; onExported?: () => void; onSandbox?: () => void; autoDemoNonce?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<GrimoireTab>("logs");
  const [testStatus, setTestStatus] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [testHarness, setTestHarness] = useState<SmokeHarness | null>(null);
  const runnerLanguage = findLanguage(language);
  const { status: sandboxStatus, mode: sandboxMode, lines: sandboxLines, exitCode: sandboxExitCode, run: runSandbox, reject: rejectSandbox, clear: clearSandbox } = useCodeSandbox();

  useEffect(() => { if (view !== "logs") return; const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [logs, view]);
  useEffect(() => { clearSandbox(); setTestStatus("idle"); setTestHarness(null); }, [finalCode, language, clearSandbox]);
  useEffect(() => {
    if (testStatus !== "running" || !testHarness) return;
    if (sandboxStatus === "idle" || sandboxStatus === "running") return;
    const passed = smokePassed(testHarness, { status: sandboxStatus, exitCode: sandboxExitCode, local: sandboxMode === "local", stdoutLines: sandboxLines.filter((l) => l.kind === "log").map((l) => l.text) });
    setTestStatus(passed ? "passed" : "failed");
  }, [sandboxExitCode, sandboxLines, sandboxMode, sandboxStatus, testHarness, testStatus]);

  const streamedCode = logs.filter((log) => log.level === "code").map((log) => log.message);
  const codeText = finalCode ?? streamedCode.join("\n");
  const hasCode = codeText.trim().length > 0;
  const diff = useMemo(() => (originalCode !== null && finalCode !== null ? diffLines(originalCode, finalCode) : []), [originalCode, finalCode]);
  const stats = useMemo(() => diffStats(diff), [diff]);
  const canDiff = originalCode !== null && finalCode !== null;
  const hasChanges = stats.added > 0 || stats.removed > 0;

  const handleCopy = useCallback(async () => {
    if (!hasCode) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(codeText);
      else { const a = document.createElement("textarea"); a.value = codeText; a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); document.execCommand("copy"); document.body.removeChild(a); }
      setCopied(true); onCopied?.(); window.setTimeout(() => setCopied(false), 1800);
    } catch {}
  }, [codeText, hasCode, onCopied]);
  const handleDownload = useCallback(() => { if (!hasCode) return; downloadText(codeText, "purified-artifact.ts", "text/plain;charset=utf-8"); }, [codeText, hasCode]);
  const handleExport = useCallback(() => {
    if (!hasCode || originalCode === null) return;
    const report = buildAutopsyReport({ originalCode, purifiedCode: codeText, findings, appliedFixes, summary, engine, logs, language });
    downloadText(report, "necrocode-exorcism-report.md", "text/markdown;charset=utf-8"); onExported?.();
  }, [appliedFixes, codeText, engine, findings, hasCode, language, logs, onExported, originalCode, summary]);
  const patch = useMemo(() => (originalCode !== null && finalCode !== null ? buildUnifiedPatch(originalCode, finalCode, patchPath(filename, runnerLanguage.extension)) : null), [filename, finalCode, originalCode, runnerLanguage.extension]);
  const handlePatch = useCallback(() => { if (!patch) return; downloadText(patch, "necrocode-fix.patch", "text/x-diff;charset=utf-8"); onExported?.(); }, [onExported, patch]);
  const testResult = testHarness && (testStatus === "passed" || testStatus === "failed") ? smokeLabel(testHarness, testStatus === "passed") : null;
  const exportItems: ExportMenuItem[] = [
    { id: "report", label: "Export Report (.md)", hint: "necrocode-exorcism-report.md", icon: EXPORT_ICONS.report, disabledReason: !hasCode || originalCode === null ? "Available after the ritual completes" : undefined, onSelect: handleExport },
    { id: "patch", label: "Download Git Patch (.patch)", hint: "necrocode-fix.patch", icon: EXPORT_ICONS.patch, disabledReason: originalCode === null ? "Available after the ritual completes" : !patch ? "No changes to patch" : undefined, onSelect: handlePatch },
    { id: "artifact", label: "Download Artifact", hint: "purified-artifact.ts", icon: EXPORT_ICONS.artifact, disabledReason: hasCode ? undefined : "No artifact yet", onSelect: handleDownload },
  ];
  const healthBefore = summary?.healthBefore;
  const healthAfter = summary?.healthAfter;
  const preflight = useCallback((code: string): boolean => {
    const match = checkRuntimeMatch(code, language);
    if (match.ok) return true;
    rejectSandbox([{ kind: "warn", text: match.message }, { kind: "system", text: `» Detected ${match.detected.label} (score ${match.detected.score}). Nothing was executed.` }]);
    return false;
  }, [language, rejectSandbox]);
  const startSandbox = useCallback((switchView: boolean) => {
    if (!finalCode) return; onSandbox?.(); if (switchView) setView("sandbox");
    setTestStatus((s) => (s === "running" ? "idle" : s)); if (!preflight(finalCode)) return; runSandbox(finalCode, language);
  }, [finalCode, language, onSandbox, preflight, runSandbox]);
  const handleSandbox = useCallback(() => startSandbox(true), [startSandbox]);
  const handleGenerateTest = useCallback(() => {
    if (!finalCode) return; setView("sandbox");
    if (!preflight(finalCode)) { setTestStatus("idle"); setTestHarness(null); return; }
    const harness = buildSmokeHarness(finalCode, language); setTestHarness(harness); setTestStatus("running"); runSandbox(harness.source, language);
  }, [finalCode, language, preflight, runSandbox]);
  useEffect(() => { if (!autoDemoNonce || !finalCode || running || !summary) return; setView("diff"); startSandbox(false); }, [autoDemoNonce, finalCode, running, summary, startSandbox]);
  useEffect(() => { if (running) setView("logs"); }, [running]);

  return (
    <aside className={`glass-obsidian dock-sigil flex h-full min-h-0 flex-col overflow-hidden rounded-2xl ${scanlines ? "scanlines" : ""}`}>
      <header className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="font-brand text-[13px] font-bold uppercase tracking-[0.16em] text-[#EDE6D6]">Grimoire Autopsy</p>
            <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-400">Right ritual dock</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {healthBefore !== undefined && healthAfter !== undefined && (
              <span data-health-before={healthBefore} data-health-after={healthAfter} title={`Soul purity before → after. 100 minus ${HEALTH_WEIGHTS.critical} per critical, ${HEALTH_WEIGHTS.warning} per warning, ${HEALTH_WEIGHTS.info} per info.`} className={`inline-flex items-center gap-1 rounded-md border bg-black/40 px-2 py-1 font-mono text-[12px] uppercase tracking-[0.08em] ${HEALTH_BORDER[healthTier(healthAfter)]}`}>
                <span className="text-zinc-400">Soul-Purity</span>
                <span className={HEALTH_COLOR[healthTier(healthBefore)]}>{healthBefore}</span>
                <span className="text-zinc-500">→</span>
                <span className={`font-bold ${HEALTH_COLOR[healthTier(healthAfter)]}`}>{healthAfter}</span>
                <span className="text-zinc-400">/100</span>
              </span>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleSandbox} disabled={!finalCode || sandboxStatus === "running"} className={`${ACTION_BUTTON} border-haunt/45 bg-haunt/10 text-haunt-glow hover:bg-haunt/15`}>
            {sandboxStatus === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}Test Sandbox
          </button>
          <button type="button" onClick={handleGenerateTest} disabled={!finalCode || testStatus === "running"} className={`${ACTION_BUTTON} border-spectral/45 bg-spectral/10 text-spectral hover:bg-spectral/15`}>
            {testStatus === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FlaskConical className="h-3.5 w-3.5" aria-hidden />}Gen Test
          </button>
          <span aria-live="polite" className={`inline-flex h-9 items-center rounded-full border px-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] ${testStatus === "passed" ? "border-neon/50 bg-neon/10 text-neon" : testStatus === "failed" ? "border-crimson/50 bg-crimson/10 text-crimson" : "border-white/15 text-zinc-300"}`}>
            {testResult ?? (testStatus === "running" ? "…" : "Test")}
          </span>
          <button type="button" onClick={handleCopy} disabled={!hasCode} className={`${ACTION_BUTTON} border-neon/45 bg-neon/10 text-neon hover:bg-neon/15`}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}
          </button>
          <ExportMenu items={exportItems} className={`${ACTION_BUTTON} border-white/15 bg-black/25 text-zinc-200 hover:text-[#EDE6D6]`} />
        </div>
        <div role="tablist" aria-label="Grimoire view" className="mt-3 flex items-center gap-1.5">
          {GRIMOIRE_TABS.map((tab) => {
            const selected = view === tab.id;
            const badge = tab.id === "diff" && canDiff ? <span className="flex items-center gap-1 text-[12px]"><span className="text-crimson">-{stats.removed}</span><span className="text-neon">+{stats.added}</span></span>
              : tab.id === "sandbox" && sandboxStatus !== "idle" ? <span data-sandbox-badge={sandboxStatus} className={`h-2 w-2 rounded-full ${SANDBOX_DOT[sandboxStatus]}`} />
              : tab.id === "logs" && running ? <span className="h-2 w-2 animate-pulse rounded-full bg-crimson" /> : null;
            return (
              <button key={tab.id} type="button" role="tab" id={`grimoire-tab-${tab.id}`} aria-selected={selected} aria-controls="grimoire-panel" onClick={() => setView(tab.id)} className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border font-sans text-[12px] font-semibold uppercase tracking-[0.08em] transition ${selected ? TAB_SELECTED[tab.id] : "border-white/10 bg-black/25 text-zinc-300 hover:text-[#EDE6D6]"}`}>
                {tab.label}{badge}
              </button>
            );
          })}
        </div>
      </header>

      {view === "logs" ? (
        <div ref={scrollRef} id="grimoire-panel" role="log" aria-live="polite" aria-labelledby="grimoire-tab-logs" className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed">
          {logs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-400">
              <ScrollText className="h-6 w-6 text-haunt/60" aria-hidden />
              <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em]">The grimoire is empty</p>
              <p className="max-w-[240px] text-[13px]">Offer a cursed artifact and press <span className="text-crimson">Exorcise Code</span>.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {logs.map((log) => (
                <motion.div key={`${log.seq}-${log.ts}`} initial={{ opacity: 0, x: -7 }} animate={{ opacity: 1, x: 0 }} className={log.level === "code" ? "my-0.5 border-l border-haunt/20 pl-2 whitespace-pre-wrap break-words text-haunt/70" : "flex gap-2 py-0.5"}>
                  {log.level !== "code" && <span className={`w-2 shrink-0 select-none ${LEVEL_COLOR[log.level]}`}>{LEVEL_GLYPH[log.level]}</span>}
                  <span className={`min-w-0 whitespace-pre-wrap break-words ${log.level === "code" ? "" : LEVEL_COLOR[log.level]}`}>{log.message}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {running && <div className="flex gap-2 py-1"><span className="text-crimson">›</span><motion.span className="inline-block h-3.5 w-1.5 bg-crimson" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.85, repeat: Infinity }} /></div>}
        </div>
      ) : view === "diff" ? (
        <div ref={scrollRef} id="grimoire-panel" role="tabpanel" aria-labelledby="grimoire-tab-diff" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2 font-mono text-[13px] leading-relaxed">
          {!canDiff ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-400"><FileText className="h-6 w-6 text-haunt/60" aria-hidden /><p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em]">{running ? "Spectral diff forming" : "No artifact to compare"}</p></div>
          ) : !hasChanges ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><Check className="h-6 w-6 text-neon" aria-hidden /><p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em] text-neon/80">No spectral residue</p></div>
          ) : (
            <div className="space-y-px">
              <div className="mb-2 flex items-center justify-between rounded-md border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-zinc-300"><span>original → purified</span><span className="flex gap-2"><span className="text-crimson">-{stats.removed}</span><span className="text-neon">+{stats.added}</span></span></div>
              {diff.map((line, index) => <DiffRow key={`${line.kind}-${line.oldLine ?? "x"}-${line.newLine ?? "x"}-${index}`} line={line} />)}
            </div>
          )}
        </div>
      ) : (
        <div id="grimoire-panel" role="tabpanel" aria-labelledby="grimoire-tab-sandbox" data-sandbox-output data-sandbox-status={sandboxStatus} className="flex min-h-0 flex-1 flex-col">
          {sandboxStatus === "idle" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-zinc-400"><Play className="h-6 w-6 text-haunt/60" aria-hidden /><p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em] text-zinc-200">Sandbox is sealed</p><p className="max-w-[260px] text-[13px]">{finalCode ? "Click TEST SANDBOX or GEN TEST to run the purified artifact." : "Exorcise an artifact first, then run it here."}</p></div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-zinc-300">
                <SquareTerminal className="h-3.5 w-3.5 text-haunt" aria-hidden /><span>Sandbox output</span>
                {sandboxMode && <span className={`rounded border px-1 py-0.5 ${sandboxMode === "remote" ? "border-spectral/30 text-spectral/80" : "border-haunt/30 text-haunt/80"}`}>{sandboxMode}</span>}
                <span className={`ml-auto ${sandboxStatus === "running" ? "text-haunt" : sandboxStatus === "complete" ? "text-neon" : sandboxStatus === "timeout" ? "text-amber-300" : "text-crimson"}`}>{sandboxStatus}</span>
                <button type="button" onClick={clearSandbox} aria-label="Clear sandbox output" className="grid h-6 w-6 place-items-center rounded border border-white/10 text-zinc-300 hover:text-crimson"><X className="h-3 w-3" aria-hidden /></button>
              </div>
              <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 font-mono text-[13px] leading-relaxed">
                {sandboxLines.map((line, index) => (
                  <div key={`${line.kind}-${index}`} className="flex gap-1.5 whitespace-pre-wrap break-words"><span className={`w-2 shrink-0 select-none ${SANDBOX_COLOR[line.kind]}`}>{SANDBOX_GLYPH[line.kind]}</span><span className={`min-w-0 ${SANDBOX_COLOR[line.kind]}`}>{line.text}</span></div>
                ))}
                {sandboxStatus === "running" && <div className="flex gap-1.5 py-0.5"><span className="w-2 text-haunt">›</span><span className="inline-block h-3 w-1.5 animate-pulse bg-haunt" /></div>}
              </div>
            </>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-white/10 bg-black/30 px-4 py-2.5">
        <div className="grid grid-cols-3 gap-2 text-center font-mono uppercase tracking-[0.12em]">
          <div className="rounded-md border border-crimson/20 bg-crimson/5 py-1.5 text-crimson"><div className="text-[14px] font-semibold leading-none">{summary?.detected ?? 0}</div><div className="mt-0.5 text-[12px] text-zinc-400">Cursed</div></div>
          <div className="rounded-md border border-neon/20 bg-neon/5 py-1.5 text-neon"><div className="text-[14px] font-semibold leading-none">{summary?.fixed ?? 0}</div><div className="mt-0.5 text-[12px] text-zinc-400">Silenced</div></div>
          <div className="rounded-md border border-haunt/20 bg-haunt/5 py-1.5 text-haunt-glow"><div className="text-[14px] font-semibold leading-none">{summary?.unresolved ?? 0}</div><div className="mt-0.5 text-[12px] text-zinc-400">Residual</div></div>
        </div>
      </div>
    </aside>
  );
}
