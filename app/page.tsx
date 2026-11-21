"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CloudFog,
  History,
  KeyRound,
  Music,
  ScanLine,
  Skull,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AgentCanvas } from "@/components/AgentCanvas";
import { ApiSigilsModal } from "@/components/ApiSigilsModal";
import { ControlPanel } from "@/components/ControlPanel";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { StatusPill } from "@/components/StatusPill";
import { Terminal } from "@/components/Terminal";
import { ToggleButton } from "@/components/ToggleButton";
import { AURA_HEX, AURA_LABEL, auraFromState } from "@/lib/aura";
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
import { useUiSettings } from "@/lib/useUiSettings";

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
  "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.14em] transition";

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
    play("click");
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-void">
      <audio
        ref={bgmRef}
        src="/audio/horror-bgm.mp3"
        loop
        preload="auto"
        aria-hidden="true"
        className="hidden"
      />
      <HorrorBackdrop aura={aura} />

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
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-crimson/15 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-crimson/40 bg-black/70 shadow-[0_0_26px_rgba(255,0,60,0.22)]">
              <span className="pointer-events-none absolute -inset-1.5 animate-[spin_26s_linear_infinite] rounded-full border border-dashed border-haunt/25" />
              <Skull className="h-5 w-5 text-crimson" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="animate-flicker font-display text-xl font-extrabold tracking-[0.16em] text-white uppercase">
                  NECROCODE
                </h1>
                <span className="font-mono text-[12px] uppercase tracking-[0.3em] text-crimson/70">
                  {"// AI CODE EXORCIST"}
                </span>
                <span className="hidden rounded border border-haunt/25 px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.2em] text-haunt/70 sm:inline">
                  Kiroween 2026
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[12px] uppercase tracking-[0.34em] text-slate-400">
                Premium 3D horror studio · WebGL · SSE · Kiro hooks
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 sm:items-end">
            {/* Tier 1 · live status readouts */}
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <StatusPill phase={state.phase} />
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
                  "bg-black/50",
                  liveEngineActive
                    ? "border-neon/40 text-neon"
                    : "border-white/15 text-zinc-200",
                ].join(" ")}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    liveEngineActive
                      ? "animate-pulse bg-neon shadow-[0_0_8px_rgba(0,255,102,0.9)]"
                      : "bg-zinc-500"
                  }`}
                />
                <span className="hidden sm:inline">
                  {liveEngineActive ? "LIVE AI ENGINE" : "BUILTIN SAFETY NET"}
                </span>
                <span className="sm:hidden">
                  {liveEngineActive ? "LIVE" : "SAFETY"}
                </span>
              </span>
              <span
                className={`${HEADER_PILL} hidden border-neon/30 bg-neon/5 text-neon md:inline-flex`}
              >
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-neon shadow-[0_0_8px_rgba(0,255,102,0.9)]" />
                SSE live
              </span>
              <span
                className={`${HEADER_PILL} hidden bg-black/50 md:inline-flex`}
                style={{
                  borderColor: `${AURA_HEX[aura]}66`,
                  color: AURA_HEX[aura],
                  boxShadow: `0 0 18px ${AURA_HEX[aura]}18`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: AURA_HEX[aura],
                    boxShadow: `0 0 8px ${AURA_HEX[aura]}`,
                  }}
                />
                {AURA_LABEL[aura]}
              </span>
            </div>

            {/* Tier 2 · controls */}
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <button
                type="button"
                onClick={handleAutoDemo}
                disabled={state.running}
                aria-label="Run the one-click judge auto demo"
                title="Load the cursed async memory leak and run the full exorcism"
                className={`${HEADER_PILL} border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson/15 hover:shadow-[0_0_18px_rgba(255,0,60,0.24)] disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                AUTO DEMO
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
                className={`${HEADER_PILL} border-haunt/45 bg-haunt/10 text-zinc-200 hover:border-haunt/70 hover:text-white hover:shadow-[0_0_18px_rgba(147,51,234,0.2)]`}
              >
                <KeyRound className="h-3.5 w-3.5 shrink-0 text-haunt-glow" aria-hidden />
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
                className={`${HEADER_PILL} border-spectral/40 bg-spectral/10 text-zinc-200 hover:border-spectral/70 hover:text-white hover:shadow-[0_0_18px_rgba(6,182,212,0.18)]`}
              >
                <History className="h-3.5 w-3.5 shrink-0 text-spectral" aria-hidden />
                <span className="hidden sm:inline">History</span>
                <span className="rounded border border-spectral/40 bg-black/50 px-1 py-px text-[10px] leading-none text-spectral">
                  {entries.length}
                </span>
              </button>

              <span className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" aria-hidden />

              <button
                type="button"
                onClick={() => toggle("bgmOn")}
                aria-pressed={settings.bgmOn}
                aria-label="Toggle horror background music"
                title="Toggle the looped horror soundtrack"
                className={[
                  HEADER_PILL,
                  settings.bgmOn
                    ? "border-blood/60 bg-blood/10 text-blood shadow-glow-blood"
                    : "border-white/15 bg-black/45 text-zinc-200 hover:border-white/30 hover:text-white",
                ].join(" ")}
              >
                <Music className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="hidden sm:inline">Horror BGM</span>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    settings.bgmOn ? "animate-pulse bg-blood" : "bg-zinc-500"
                  }`}
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!settings.soundOn) play("click");
                  toggle("soundOn");
                }}
                aria-pressed={settings.soundOn}
                aria-label="Toggle 3D audio effects"
                className={[
                  HEADER_PILL,
                  settings.soundOn
                    ? "border-haunt/60 bg-haunt/10 text-haunt-glow shadow-glow-haunt"
                    : "border-white/15 bg-black/45 text-zinc-200 hover:border-white/30 hover:text-white",
                ].join(" ")}
              >
                {settings.soundOn ? (
                  <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span className="hidden sm:inline">3D Audio FX</span>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    settings.soundOn ? "animate-pulse bg-haunt" : "bg-zinc-500"
                  }`}
                />
              </button>

              <ToggleButton
                label="CRT Haunting"
                shortLabel="CRT"
                icon={ScanLine}
                active={settings.scanlinesOn}
                onToggle={() => {
                  play("click");
                  toggle("scanlinesOn");
                }}
                accent="spectral"
                title="Toggle flickering CRT scanlines"
              />
              <ToggleButton
                label="Eerie Fog"
                shortLabel="Fog"
                icon={CloudFog}
                active={settings.fogOn}
                onToggle={() => {
                  play("click");
                  toggle("fogOn");
                }}
                accent="blood"
                title="Toggle drifting fog and the animated rune grid"
              />
            </div>
          </div>
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

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 py-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_minmax(0,1.1fr)] lg:items-stretch xl:grid-cols-[minmax(340px,1.05fr)_minmax(440px,1.35fr)_minmax(360px,1.1fr)]">
          <div className="min-h-[580px] lg:min-h-0">
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
          </div>

          <div className="min-h-[560px] sm:min-h-[630px] lg:min-h-0">
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
          </div>

          <div className="min-h-[420px] lg:min-h-0">
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
          </div>
        </div>

        <footer className="hidden shrink-0 items-center justify-between border-t border-white/5 py-1.5 font-mono text-[12px] uppercase tracking-[0.24em] text-slate-400 sm:flex">
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
