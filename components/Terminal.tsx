"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  ScrollText,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EXPORT_ICONS,
  ExportMenu,
  type ExportMenuItem,
} from "@/components/ExportMenu";
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

/** Soul-purity bar color per tier. */
const PURITY_HEX: Record<HealthTier, string> = {
  cursed: "#FF003C",
  haunted: "#FCD34D",
  pure: "#00FF66",
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
  "medieval-btn inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border font-sans text-[12px] font-semibold uppercase leading-none tracking-[0.08em] text-bone transition disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-500 disabled:shadow-none";

type GrimoireTab = "logs" | "diff" | "sandbox";

/** Toolbar label density: full labels → shorter labels → icon-heavy. */
type ToolbarDensity = "full" | "compact" | "tight";
const DENSITY_STEPS: ToolbarDensity[] = ["full", "compact", "tight"];

const GRIMOIRE_TABS: Array<{ id: GrimoireTab; label: string }> = [
  { id: "logs", label: "Terminal" },
  { id: "diff", label: "Spectral Diff" },
  { id: "sandbox", label: "Sandbox" },
];

/** RGB for each tab's etched plate (`.arcane-plate` reads `--plate`). */
const TAB_PLATE: Record<GrimoireTab, string> = {
  logs: "226, 217, 200",
  diff: "157, 78, 221",
  sandbox: "0, 255, 102",
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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<ToolbarDensity>("full");
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

  const testResult =
    testHarness && (testStatus === "passed" || testStatus === "failed")
      ? smokeLabel(testHarness, testStatus === "passed")
      : null;

  const exportItems: ExportMenuItem[] = [
    {
      id: "report",
      label: "Export Report (.md)",
      hint: "necrocode-exorcism-report.md",
      icon: EXPORT_ICONS.report,
      disabledReason:
        !hasCode || originalCode === null
          ? "Available after the ritual completes"
          : undefined,
      onSelect: handleExport,
    },
    {
      id: "patch",
      label: "Download Git Patch (.patch)",
      hint: `necrocode-fix.patch · git apply → ${patchPath(filename, runnerLanguage.extension)}`,
      icon: EXPORT_ICONS.patch,
      disabledReason:
        originalCode === null
          ? "Available after the ritual completes"
          : !patch
            ? "No changes to patch"
            : undefined,
      onSelect: handlePatch,
    },
    {
      id: "artifact",
      label: "Download Artifact",
      hint: "purified-artifact.ts",
      icon: EXPORT_ICONS.artifact,
      disabledReason: hasCode ? undefined : "No artifact yet",
      onSelect: handleDownload,
    },
  ];

  const healthBefore = summary?.healthBefore;
  const healthAfter = summary?.healthAfter;
  const scored = healthBefore !== undefined && healthAfter !== undefined;

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

  // Toolbar density: start from "full" whenever the width or the content
  // changes, then step down until the single row fits (before paint).
  useLayoutEffect(() => {
    setDensity("full");
  }, [copied, testResult]);

  useLayoutEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    if (element.scrollWidth > element.clientWidth + 1) {
      const next = DENSITY_STEPS[DENSITY_STEPS.indexOf(density) + 1];
      if (next) setDensity(next);
    }
  });

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let lastWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth;
      if (width !== lastWidth) {
        lastWidth = width;
        setDensity("full");
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      <div className="relative z-30 shrink-0 border-b border-gold/15 bg-[#0a0b14]/95 backdrop-blur-md">
        <div
          role="tablist"
          aria-label="Grimoire view"
          className="flex items-center gap-1 px-2.5 pb-2 pt-2"
        >
          {GRIMOIRE_TABS.map((tab) => {
            const selected = view === tab.id;
            const badge =
              tab.id === "diff" && canDiff ? (
                <span className="flex shrink-0 items-center gap-1 text-[12px] normal-case tracking-normal">
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
                // "Spectral" is visually hidden below xl; keep the full name.
                aria-label={tab.id === "diff" ? tab.label : undefined}
                aria-selected={selected}
                aria-controls="grimoire-panel"
                onClick={() => setView(tab.id)}
                style={{ "--plate": TAB_PLATE[tab.id] } as CSSProperties}
                className={[
                  "arcane-plate inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-2 font-sans text-[12px] font-bold uppercase leading-none tracking-[0.12em] transition",
                  selected ? "text-bone" : "text-bone/70 hover:text-bone",
                ].join(" ")}
              >
                {tab.id === "diff" ? (
                  <span className="truncate">
                    <span className="hidden xl:inline">Spectral </span>Diff
                  </span>
                ) : (
                  <span className="truncate">{tab.label}</span>
                )}
                {badge}
              </button>
            );
          })}
        </div>
        {/* Soul-purity: the Code Health & Security Score, before → after. */}
        <div
          data-soul-purity
          data-health-before={healthBefore}
          data-health-after={healthAfter}
          title={`Code Health & Security Score before → after exorcism. 100 minus ${HEALTH_WEIGHTS.critical} per critical, ${HEALTH_WEIGHTS.warning} per warning, ${HEALTH_WEIGHTS.info} per info finding.`}
          className="px-3 pb-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-brand text-[13px] font-bold uppercase tracking-[0.1em] text-bone">
              Soul-purity
            </span>
            {scored ? (
              <span
                aria-label={`Health score ${healthBefore} out of 100 before, ${healthAfter} out of 100 after`}
                className="font-mono text-[13px] tabular-nums"
              >
                <span className={HEALTH_COLOR[healthTier(healthBefore)]}>{healthBefore}</span>
                <span className="text-bone/60"> → </span>
                <span className={`font-bold ${HEALTH_COLOR[healthTier(healthAfter)]}`}>{healthAfter}</span>
                <span className="text-bone/60"> /100</span>
              </span>
            ) : (
              <span className="font-sans text-[12px] font-medium text-bone/60">
                {summary ? "Not scored for this runtime" : "Awaiting ritual"}
              </span>
            )}
          </div>
          <div
            aria-hidden
            className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-black/60 shadow-[inset_0_0_0_1px_rgba(176,141,87,0.3)]"
          >
            {scored && (
              <>
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${healthAfter}%`,
                    background: `linear-gradient(90deg, #8B0000, ${PURITY_HEX[healthTier(healthAfter)]})`,
                    boxShadow: `0 0 10px ${PURITY_HEX[healthTier(healthAfter)]}`,
                  }}
                />
                <span
                  className="absolute top-0 h-full w-0.5 bg-bone/90"
                  style={{ left: `calc(${healthBefore}% - 1px)` }}
                />
              </>
            )}
          </div>
        </div>

        {/*
          Single-row toolbar. Primary actions stay visible; exports live in
          the Export menu. `density` steps down (labels → icons) only when the
          row would overflow, measured in a layout effect before paint.
        */}
        <div
          data-terminal-actions
          data-density={density}
          className={`flex items-center px-2.5 pb-2.5 ${density === "tight" ? "gap-1" : "gap-1.5"}`}
        >
          {/* Primary actions. Only this row scrolls (last resort); the Export
              menu sits outside it so its dropdown is never clipped. */}
          <div
            ref={toolbarRef}
            className={`flex min-w-0 flex-1 flex-nowrap items-center overflow-x-auto overflow-y-hidden ${
              density === "tight" ? "gap-1" : "gap-1.5"
            }`}
          >
            <span className="inline-flex shrink-0 items-center">
              <button
                type="button"
                onClick={handleGenerateTest}
                disabled={!finalCode || testStatus === "running"}
                aria-label="Gen test"
                title={
                  runnerLanguage.id === "python" ||
                  runnerLanguage.id === "javascript" ||
                  runnerLanguage.id === "typescript" ||
                  runnerLanguage.id === "tsx"
                    ? `Generate and run a native ${runnerLanguage.label} assertion suite for the purified functions`
                    : `Run a ${runnerLanguage.label} smoke check: passes when the purified artifact exits with code 0`
                }
                className={`${ACTION_BUTTON} ${density === "tight" ? "px-2" : "px-2.5"} ${
                  testResult ? "rounded-r-none border-r-0" : ""
                } border-gold/35 bg-gold/[0.06] hover:bg-gold/10 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]`}
              >
                {testStatus === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <FlaskConical className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                )}
                {density === "tight" ? "Test" : "Gen test"}
              </button>
              {testResult && (
                <span
                  data-test-result={testStatus}
                  title={testResult}
                  className={[
                    "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-r-lg border px-2 font-mono text-[12px] font-bold uppercase leading-none tracking-[0.06em]",
                    testStatus === "passed"
                      ? "border-neon/50 bg-neon/15 text-neon"
                      : "border-crimson/50 bg-crimson/15 text-crimson",
                  ].join(" ")}
                >
                  {testStatus === "passed" ? (
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  {density !== "tight" && (testStatus === "passed" ? "Pass" : "Fail")}
                  <span className="sr-only">{testResult}</span>
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={handleSandbox}
              disabled={!finalCode || sandboxStatus === "running"}
              aria-label="Test sandbox"
              title={
                finalCode
                  ? runnerLanguage.local
                    ? "Run the purified JavaScript in a 2-second sandboxed Web Worker"
                    : `Run the purified ${runnerLanguage.label} on the remote 25-second sandbox`
                  : "The sandbox is sealed until the purified artifact arrives"
              }
              className={`${ACTION_BUTTON} ${density === "tight" ? "px-2" : "px-2.5"} border-amethyst/55 bg-amethyst/15 hover:bg-amethyst/20 hover:shadow-[0_0_20px_rgba(147,51,234,0.24)]`}
            >
              {sandboxStatus === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0 text-amethyst-glow" aria-hidden />
              )}
              {density === "full" ? "Test sandbox" : "Sandbox"}
            </button>

            <span className="sr-only" aria-live="polite">
              {testStatus === "running" ? "Smoke test running" : testResult ?? ""}
            </span>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!hasCode}
              aria-label={copied ? "Copied" : "Copy purified code"}
              title={hasCode ? "Copy the purified artifact" : "No artifact yet"}
              className={`${ACTION_BUTTON} ${density === "full" ? "px-2.5" : "px-2"} border-neon/40 bg-neon/[0.07] hover:bg-neon/15 hover:shadow-[0_0_20px_rgba(0,255,102,0.2)]`}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-neon" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5 shrink-0 text-neon" aria-hidden />
              )}
              {density === "full" && (copied ? "Copied" : "Copy")}
            </button>

          </div>
          <ExportMenu
            compact={density !== "full"}
            items={exportItems}
            className={`${ACTION_BUTTON} ${density === "full" ? "px-2.5" : "px-2"} border-gold/20 bg-black/40 hover:border-gold/40 hover:bg-white/[0.06] aria-expanded:border-haunt/60 aria-expanded:bg-haunt/10`}
          />
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
        <div className="cathedral-plaque relative z-10 border-t border-gold/20 px-3 pb-2.5 pt-2">
          <h3 className="text-center font-brand text-[13px] font-bold uppercase tracking-[0.12em] text-bone">
            Corruption Report
          </h3>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Cursed", summary.detected, "139, 0, 0"],
                ["Silenced", summary.fixed, "0, 255, 102"],
                ["Residual", summary.unresolved, "74, 21, 75"],
              ] as const
            ).map(([label, value, pane]) => (
              <div
                key={label}
                className="glass-pane rounded-t-[14px] px-1 pb-1.5 pt-2"
                style={{ "--pane": pane } as CSSProperties}
              >
                <div className="font-brand text-[17px] font-bold leading-none text-bone [text-shadow:0_0_10px_rgba(0,0,0,0.9)]">
                  {value}
                </div>
                <div className="mt-1 font-sans text-[12px] font-bold uppercase tracking-[0.1em] text-bone/85">
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-center">
            <span
              data-ritual-verdict={summary.unresolved > 0 ? "residual" : "purified"}
              className={`medieval-btn inline-flex h-8 items-center px-6 font-brand text-[13px] font-bold uppercase tracking-[0.12em] ${
                summary.unresolved > 0
                  ? "bg-crimson/15 text-crimson [box-shadow:inset_0_0_0_1px_rgba(255,0,60,0.6),inset_0_0_14px_rgba(255,0,60,0.3)]"
                  : "bg-neon/10 text-neon [box-shadow:inset_0_0_0_1px_rgba(0,255,102,0.55),inset_0_0_14px_rgba(0,255,102,0.25)]"
              }`}
            >
              {summary.unresolved > 0 ? "Residual" : "Purified"}
            </span>
          </div>
        </div>
      )}

    </aside>
  );
}
