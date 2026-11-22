"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, History, KeyRound, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AgentCanvas } from "@/components/AgentCanvas";
import { ApiSigilsModal } from "@/components/ApiSigilsModal";
import { ControlPanel } from "@/components/ControlPanel";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { FxMenu } from "@/components/FxMenu";
import { SigilFrame } from "@/components/SigilFrame";
import { Terminal } from "@/components/Terminal";
import { WebGLBoundary } from "@/components/WebGLBoundary";
import { auraFromState } from "@/lib/aura";
import {
  DEFAULT_ARTIFACT_ID,
  DEFAULT_CURSED_CODE,
  findArtifact,
} from "@/lib/cursedCode";
import {
  createHistoryId,
  type GrimoireHistoryEntry,
  historyFingerprint,
  historyPreview,
  slimHistoryLogs,
} from "@/lib/history";
import { useHorrorAudio } from "@/lib/horrorAudio";
import {
  DEFAULT_LANGUAGE,
  findLanguage,
  isLanguageId,
  languageIdFromFilename,
} from "@/lib/languages";
import { sfxForEvent } from "@/lib/sfxMap";
import { useAgentStream } from "@/lib/useAgentStream";
import { useApiSigils } from "@/lib/useApiSigils";
import { useCyberSound } from "@/lib/useCyberSound";
import { useGrimoireHistory } from "@/lib/useGrimoireHistory";
import { type UiSettings, useUiSettings } from "@/lib/useUiSettings";

const HorrorBackdrop = dynamic(
  () =>
    import("@/components/three/HorrorBackdrop").then(
      (mod) => mod.HorrorBackdrop,
    ),
  { ssr: false },
);

const initialArtifact = findArtifact(DEFAULT_ARTIFACT_ID);
const DEFAULT_CODE = initialArtifact?.code ?? DEFAULT_CURSED_CODE;
const DEFAULT_FILENAME = "cursed-ouroboros-loop.js";
/** Shared header pill: 11px, single line, never shrinks, so pills never clip. */
const HEADER_PILL =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-display text-[12px] font-bold uppercase leading-none tracking-[0.12em] transition";

/** Quiet utility button: no fill, faint border, brightens on hover/focus. */
const GHOST_PILL =
  "border-gold/15 bg-white/[0.03] text-bone/85 backdrop-blur-md hover:border-gold/35 hover:bg-white/[0.06] hover:text-bone focus-visible:border-gold/45 focus-visible:text-bone";

/** Header emblem: gold sigil circle with a blood inverted triangle and runes. */
function SigilEmblem() {
  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,0,60,0.35),transparent_65%)] blur-[6px]"
      />
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        focusable="false"
        className="rune-ring relative h-12 w-12 text-gold [animation-duration:40s] [filter:drop-shadow(0_0_6px_rgba(255,0,60,0.55))]"
      >
        <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.8" />
        <circle cx="24" cy="24" r="18.5" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 3" strokeOpacity="0.6" />
        <path d="M24 39 9.7 14.2h28.6Z" fill="none" stroke="#FF003C" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M24 9v6M24 33v6M9 24h6M33 24h6" stroke="currentColor" strokeWidth="1" strokeOpacity="0.7" />
        <circle cx="24" cy="22.5" r="3.2" fill="#FF003C" />
        <circle cx="24" cy="22.5" r="1.2" fill="#E2D9C8" />
      </svg>
    </div>
  );
}

type MobileTab = "spellbook" | "ritual" | "grimoire";

const MOBILE_TABS: Array<{ id: MobileTab; label: string }> = [
  { id: "spellbook", label: "Spellbook" },
  { id: "ritual", label: "3D Ritual" },
  { id: "grimoire", label: "Grimoire" },
];

const AUTO_DEMO_ARTIFACT_ID = "async-memory-leak";
const AUTO_DEMO_DIRECTIVE =
  "Hunt the async ritual cache, quiet promise leakage, and the unquiet dead promise.";

function extensionFor(language: string): string {
  return findLanguage(language).extension;
}

export default function Home() {
  const { state, run, reset, restore } = useAgentStream();
  const { settings, toggle } = useUiSettings();
  const { play } = useCyberSound(settings.soundOn);
  const {
    sigils,
    liveKeys,
    saveSigils,
    clearSigils,
  } = useApiSigils();
  const { entries, addEntry, clearHistory } = useGrimoireHistory();
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  const [code, setCode] = useState(DEFAULT_CODE);
  const [directive, setDirective] = useState("");
  const [filename, setFilename] = useState(DEFAULT_FILENAME);
  const [language, setLanguage] = useState<string>(
    initialArtifact?.language ?? DEFAULT_LANGUAGE,
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    DEFAULT_ARTIFACT_ID,
  );
  const [apiOpen, setApiOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autoDemoNonce, setAutoDemoNonce] = useState(0);
  const [mobileTab, setMobileTab] = useState<MobileTab>("spellbook");
  const mobileTabMounted = useRef(false);

  const lastSonifiedSeq = useRef<number>(-1);
  const lastHistoryFingerprint = useRef<string | null>(null);
  const aura = auraFromState(state.phase, state.bugCount, state.summary);
  const bgmSurge =
    state.running && state.activeStage !== "clean_code_output";
  const liveEngineActive =
    liveKeys &&
    (state.phase === "idle" ||
      state.running ||
      state.engine.name !== "Heuristic");

  useHorrorAudio(bgmRef, settings.bgmOn, bgmSurge);

  // Mobile only: bring the newly selected panel to the top of the viewport
  // (below the sticky tab bar, via `scroll-mt-16`). Skipped on first render.
  useEffect(() => {
    if (!mobileTabMounted.current) {
      mobileTabMounted.current = true;
      return;
    }
    if (!window.matchMedia("(max-width: 1023.98px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`panel-${mobileTab}`)?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileTab]);

  useEffect(() => {
    if (!settings.soundOn) return;
    for (const log of state.logs) {
      if (log.seq <= lastSonifiedSeq.current) continue;
      lastSonifiedSeq.current = log.seq;
      const sfx = sfxForEvent(log);
      if (sfx) play(sfx);
    }
  }, [state.logs, settings.soundOn, play]);

  useEffect(() => {
    if (
      !state.summary ||
      !state.finalCode ||
      !state.originalCode ||
      state.running
    ) {
      return;
    }

    const entry: GrimoireHistoryEntry = {
      id: createHistoryId(),
      createdAt: state.logs[0]?.ts ?? new Date().toISOString(),
      filename,
      directive,
      language,
      preview: historyPreview(state.originalCode),
      engine: state.engine,
      summary: state.summary,
      originalCode: state.originalCode,
      purifiedCode: state.finalCode,
      findings: state.findings,
      appliedFixes: state.appliedFixes,
      logs: slimHistoryLogs(state.logs),
    };
    const fingerprint = historyFingerprint(entry);
    if (lastHistoryFingerprint.current === fingerprint) return;

    lastHistoryFingerprint.current = fingerprint;
    addEntry(entry);
  }, [
    addEntry,
    directive,
    filename,
    language,
    state.appliedFixes,
    state.engine,
    state.finalCode,
    state.findings,
    state.logs,
    state.originalCode,
    state.running,
    state.summary,
  ]);

  const handleSelectPreset = (id: string) => {
    const artifact = findArtifact(id);
    if (!artifact) return;
    setCode(artifact.code);
    setFilename(`cursed-${artifact.id}.${extensionFor(artifact.language)}`);
    setLanguage(artifact.language);
    setSelectedPresetId(artifact.id);
    play("click");
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    setSelectedPresetId(null);
  };

  const handleRun = () => {
    if (state.running) return;
    lastSonifiedSeq.current = -1;
    play("dhum");
    setMobileTab("ritual");
    void run({ code, directive, language, sigils });
  };

  const handleAutoDemo = () => {
    if (state.running) return;
    lastSonifiedSeq.current = -1;
    play("dhum");
    const artifact = findArtifact(AUTO_DEMO_ARTIFACT_ID);
    if (!artifact) return;
    setCode(artifact.code);
    setDirective(AUTO_DEMO_DIRECTIVE);
    setFilename(`cursed-${artifact.id}.${extensionFor(artifact.language)}`);
    setLanguage(artifact.language);
    setSelectedPresetId(artifact.id);
    setAutoDemoNonce((nonce) => nonce + 1);
    setMobileTab("ritual");
    void run({
      code: artifact.code,
      directive: AUTO_DEMO_DIRECTIVE,
      language: artifact.language,
      sigils,
    });
  };

  const handleReset = () => {
    lastSonifiedSeq.current = -1;
    play("click");
    reset();
  };

  const handleRestore = (entry: GrimoireHistoryEntry) => {
    lastHistoryFingerprint.current = historyFingerprint(entry);
    lastSonifiedSeq.current = entry.logs.at(-1)?.seq ?? -1;
    setCode(entry.originalCode);
    setDirective(entry.directive);
    setFilename(entry.filename);
    const restoredLanguage =
      entry.language ??
      languageIdFromFilename(entry.filename) ??
      DEFAULT_LANGUAGE;
    setLanguage(
      isLanguageId(restoredLanguage) ? restoredLanguage : DEFAULT_LANGUAGE,
    );
    setSelectedPresetId(null);
    restore({
      logs: entry.logs,
      summary: entry.summary,
      finalCode: entry.purifiedCode,
      originalCode: entry.originalCode,
      findings: entry.findings,
      appliedFixes: entry.appliedFixes,
      engine: entry.engine,
    });
    setHistoryOpen(false);
    setMobileTab("grimoire");
    play("click");
  };

  const handleFxToggle = (key: keyof UiSettings) => {
    // The click SFX only sounds when 3D Audio FX is (or is about to be) on.
    if (key !== "soundOn" || !settings.soundOn) play("click");
    toggle(key);
  };

  /**
   * Below `lg` only the selected panel is shown; all three stay mounted.
   * The wrapper is a flex column sized by its content between 420px and
   * 78dvh; the panel inside grows/shrinks to fill it (`[&>*]:flex-1`). The
   * Ritual panel has no in-flow content (all layers are absolute), so it gets
   * a taller floor. From `lg` the grid row sizes every panel.
   */
  const mobilePanel = (tab: MobileTab) =>
    [
      mobileTab === tab ? "flex" : "hidden",
      "scroll-mt-16 flex-col max-h-[78dvh] [&>*]:min-h-0 [&>*]:flex-1",
      tab === "ritual" ? "min-h-[max(420px,60dvh)]" : "min-h-[420px]",
      "lg:block lg:max-h-none lg:min-h-0",
    ].join(" ");

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Cathedral nave: charcoal stone + stained-glass window glow. */}
      <div aria-hidden className="cathedral-stone pointer-events-none fixed inset-0 z-0" />
      <audio
        ref={bgmRef}
        src="/audio/horror-bgm.mp3"
        loop
        preload="auto"
        aria-hidden="true"
        className="hidden"
      />
      {/* Decorative: if WebGL fails, drop the backdrop instead of the page. */}
      <WebGLBoundary>
        <HorrorBackdrop aura={aura} />
      </WebGLBoundary>

      {settings.fogOn && (
        <div className="fog-layer pointer-events-none fixed inset-0 z-0 animate-fog-drift opacity-60" />
      )}
      <div className="haunted-grid pointer-events-none fixed inset-0 z-0 opacity-25" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_18%,rgba(6,6,12,0.92)_100%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_110%,rgba(255,0,60,0.09),transparent_55%)]" />
      {settings.scanlinesOn && (
        <div className="crt-overlay animate-flicker" aria-hidden />
      )}

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-4 py-3 lg:h-screen lg:min-h-0 lg:py-4">
        <header className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
          {/* Summoning-bar rule: gold hairline with a blood core. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(226,217,200,0.35)_20%,rgba(255,0,60,0.7)_50%,rgba(226,217,200,0.35)_80%,transparent)]"
          />
          {/* Left · brand + active engine */}
          <div className="flex min-w-0 items-center gap-3">
            <SigilEmblem />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="font-brand text-[22px] font-black uppercase leading-none tracking-[0.12em] text-gold [text-shadow:0_0_18px_rgba(255,0,60,0.45),0_0_2px_rgba(226,217,200,0.6)]">
                  NecroCode
                </h1>
                <span className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-crimson [text-shadow:0_0_10px_rgba(255,0,60,0.5)]">
                  {"// Occult Code Exorcist"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  title={
                    liveKeys
                      ? liveEngineActive
                        ? "A live API sigil will be used on the next exorcism."
                        : "A live sigil is configured, but the last run used the builtin safety net."
                      : "No API sigil configured — the builtin deterministic engine is active."
                  }
                  className={[
                    HEADER_PILL,
                    "h-6 bg-black/50",
                    liveEngineActive
                      ? "border-neon/45 text-neon"
                      : "border-white/20 text-zinc-200",
                  ].join(" ")}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      liveEngineActive
                        ? "animate-pulse bg-neon shadow-[0_0_8px_rgba(0,255,102,0.9)]"
                        : "bg-zinc-400"
                    }`}
                  />
                  {liveEngineActive ? "Live AI engine" : "Builtin safety net"}
                </span>
                <span className="hidden font-display text-[12px] font-semibold uppercase tracking-[0.2em] text-gold-dim md:inline">
                  Kiroween 2026
                </span>
              </div>
            </div>
          </div>

          {/* Right · utilities + FX popover */}
          <nav aria-label="Studio controls" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAutoDemo}
              disabled={state.running}
              aria-label="Run the one-click judge auto demo"
              title="Load the cursed async memory leak and run the full exorcism"
              className={`${HEADER_PILL} border-crimson bg-[linear-gradient(180deg,#5a0718_0%,#2a030c_55%,#3b0a2e_100%)] font-bold text-gold shadow-[0_0_22px_rgba(255,0,60,0.45),0_0_40px_rgba(157,78,221,0.25),inset_0_1px_0_rgba(226,217,200,0.35),inset_0_0_14px_rgba(255,0,60,0.35)] hover:text-white hover:shadow-[0_0_30px_rgba(255,0,60,0.6),0_0_52px_rgba(157,78,221,0.32),inset_0_1px_0_rgba(226,217,200,0.45),inset_0_0_18px_rgba(255,0,60,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none`}
            >
              <Sparkles className="h-4 w-4 shrink-0 text-crimson" aria-hidden />
              Auto demo
            </button>
            <button
              type="button"
              onClick={() => {
                play("click");
                setHistoryOpen(false);
                setApiOpen(true);
              }}
              aria-haspopup="dialog"
              aria-label="Open API sigils"
              className={`${HEADER_PILL} ${GHOST_PILL}`}
            >
              <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">API Sigils</span>
            </button>
            <button
              type="button"
              onClick={() => {
                play("click");
                setApiOpen(false);
                setHistoryOpen(true);
              }}
              aria-haspopup="dialog"
              aria-label="Open grimoire history"
              className={`${HEADER_PILL} ${GHOST_PILL}`}
            >
              <History className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">History</span>
              <span className="rounded border border-white/15 px-1 py-px text-[12px] leading-none text-zinc-300">
                {entries.length}
              </span>
            </button>
            <FxMenu
              settings={settings}
              onToggle={handleFxToggle}
              className={`${HEADER_PILL} ${GHOST_PILL} aria-expanded:border-white/30 aria-expanded:bg-white/[0.06] aria-expanded:text-white`}
            />
          </nav>
        </header>

        <AnimatePresence>
          {state.error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex items-center gap-2 rounded-xl border border-crimson/40 bg-crimson/10 px-4 py-2 font-mono text-[13px] text-crimson shadow-[0_0_24px_rgba(255,0,60,0.15)]"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {state.error}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          role="tablist"
          aria-label="Studio panel"
          className="sticky top-0 z-30 -mx-4 mt-3 flex gap-1.5 border-b border-white/10 bg-[#0a0b14]/90 px-4 py-2 backdrop-blur-md lg:hidden"
        >
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setMobileTab(tab.id)}
              className={[
                "inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-display text-[13px] font-bold uppercase tracking-[0.08em] transition",
                mobileTab === tab.id
                  ? "border-crimson/60 bg-crimson/10 text-white shadow-[0_0_16px_rgba(255,0,60,0.18)]"
                  : "border-white/15 bg-black/40 text-zinc-300 hover:text-white",
              ].join(" ")}
            >
              {tab.label}
              {tab.id === "ritual" && state.running && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-crimson" aria-hidden />
              )}
            </button>
          ))}
        </div>

        <div className="pb-safe grid min-h-0 flex-1 grid-cols-1 gap-4 pt-4 lg:pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1.1fr)] lg:items-stretch xl:grid-cols-[minmax(330px,1fr)_minmax(440px,1.35fr)_minmax(360px,1.1fr)]">
          <div id="panel-spellbook" className={mobilePanel("spellbook")}>
            <SigilFrame>
              <ControlPanel
                code={code}
                onCodeChange={handleCodeChange}
                directive={directive}
                onDirectiveChange={setDirective}
                filename={filename}
                onFilenameChange={setFilename}
                language={language}
                onLanguageChange={setLanguage}
                onSelectPreset={handleSelectPreset}
                selectedPresetId={selectedPresetId}
                onRun={handleRun}
                onReset={handleReset}
                running={state.running}
                phase={state.phase}
                progress={state.progress}
              />
            </SigilFrame>
          </div>

          <div id="panel-ritual" className={mobilePanel("ritual")}>
            <SigilFrame>
              <AgentCanvas
                nodes={state.nodes}
                activeStage={state.activeStage}
                bugCount={state.bugCount}
                aura={aura}
                progress={state.progress}
                running={state.running}
                phase={state.phase}
                summary={state.summary}
                logs={state.logs}
                engine={state.engine}
                scanlines={settings.scanlinesOn}
              />
            </SigilFrame>
          </div>

          <div id="panel-grimoire" className={mobilePanel("grimoire")}>
            <SigilFrame>
              <Terminal
                logs={state.logs}
                running={state.running}
                scanlines={settings.scanlinesOn}
                summary={state.summary}
                finalCode={state.finalCode}
                originalCode={state.originalCode}
                findings={state.findings}
                appliedFixes={state.appliedFixes}
                engine={state.engine}
                language={language}
                filename={filename}
                onCopied={() => play("copy")}
                onExported={() => play("click")}
                onSandbox={() => play("click")}
                autoDemoNonce={autoDemoNonce}
              />
            </SigilFrame>
          </div>
        </div>

        <footer className="hidden shrink-0 items-center justify-between border-t border-white/5 py-1.5 font-mono text-[12px] uppercase tracking-[0.2em] text-zinc-400 lg:flex">
          <span>the crypt is always listening</span>
          <span>WebGL · SSE · Kiro</span>
        </footer>
      </div>

      <ApiSigilsModal
        open={apiOpen}
        sigils={sigils}
        onClose={() => setApiOpen(false)}
        onSave={saveSigils}
        onClear={clearSigils}
      />
      <HistoryDrawer
        open={historyOpen}
        entries={entries}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestore}
        onClear={clearHistory}
      />
    </main>
  );
}
