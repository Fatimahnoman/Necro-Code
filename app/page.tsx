"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, History, KeyRound, Skull, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AgentCanvas } from "@/components/AgentCanvas";
import { ApiSigilsModal } from "@/components/ApiSigilsModal";
import { BatSwarmOverlay } from "@/components/BatSwarmOverlay";
import { ControlPanel } from "@/components/ControlPanel";
import { FxMenu } from "@/components/FxMenu";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { Terminal } from "@/components/Terminal";
import { WebGLBoundary } from "@/components/WebGLBoundary";
import { auraFromState } from "@/lib/aura";
import { DEFAULT_ARTIFACT_ID, DEFAULT_CURSED_CODE, findArtifact } from "@/lib/cursedCode";
import { createHistoryId, type GrimoireHistoryEntry, historyFingerprint, historyPreview, slimHistoryLogs } from "@/lib/history";
import { useHorrorAudio } from "@/lib/horrorAudio";
import { DEFAULT_LANGUAGE, findLanguage, isLanguageId, languageIdFromFilename } from "@/lib/languages";
import { sfxForEvent } from "@/lib/sfxMap";
import { useAgentStream } from "@/lib/useAgentStream";
import { useApiSigils } from "@/lib/useApiSigils";
import { useCyberSound } from "@/lib/useCyberSound";
import { useGrimoireHistory } from "@/lib/useGrimoireHistory";
import { type UiSettings, useUiSettings } from "@/lib/useUiSettings";

const HorrorBackdrop = dynamic(() => import("@/components/three/HorrorBackdrop").then((mod) => mod.HorrorBackdrop), { ssr: false });

const initialArtifact = findArtifact(DEFAULT_ARTIFACT_ID);
const DEFAULT_CODE = initialArtifact?.code ?? DEFAULT_CURSED_CODE;
const DEFAULT_FILENAME = "cursed-ouroboros-loop.js";
type MobileTab = "spellbook" | "ritual" | "grimoire";
const MOBILE_TABS: Array<{ id: MobileTab; label: string }> = [
  { id: "spellbook", label: "Spellbook" },
  { id: "ritual", label: "3D Altar" },
  { id: "grimoire", label: "Autopsy" },
];
const AUTO_DEMO_ARTIFACT_ID = "async-memory-leak";
const AUTO_DEMO_DIRECTIVE = "Hunt the async ritual cache, quiet promise leakage, and the unquiet dead promise.";
function extensionFor(language: string): string { return findLanguage(language).extension; }

export default function Home() {
  const { state, run, reset, restore } = useAgentStream();
  const { settings, toggle } = useUiSettings();
  const { play } = useCyberSound(settings.soundOn);
  const { sigils, liveKeys, saveSigils, clearSigils } = useApiSigils();
  const { entries, addEntry, clearHistory } = useGrimoireHistory();
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [directive, setDirective] = useState("");
  const [filename, setFilename] = useState(DEFAULT_FILENAME);
  const [language, setLanguage] = useState<string>(initialArtifact?.language ?? DEFAULT_LANGUAGE);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(DEFAULT_ARTIFACT_ID);
  const [apiOpen, setApiOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autoDemoNonce, setAutoDemoNonce] = useState(0);
  const [autoRunNonce, setAutoRunNonce] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("spellbook");
  const [fxFlash, setFxFlash] = useState(false);
  const [fxShake, setFxShake] = useState(false);
  const mobileTabMounted = useRef(false);
  const lastSonifiedSeq = useRef<number>(-1);
  const lastHistoryFingerprint = useRef<string | null>(null);
  const lastAutoRunFingerprint = useRef<string | null>(null);
  const aura = auraFromState(state.phase, state.bugCount, state.summary);
  const bgmSurge = state.running && state.activeStage !== "clean_code_output";
  const liveEngineActive = liveKeys && (state.phase === "idle" || state.running || state.engine.name !== "Heuristic");

  useHorrorAudio(bgmRef, settings.bgmOn, bgmSurge);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (state.phase !== "purified" || !state.finalCode) return;
    const fingerprint = `${language}::${state.finalCode}`;
    if (lastAutoRunFingerprint.current === fingerprint) return;
    lastAutoRunFingerprint.current = fingerprint;
    setAutoRunNonce((n) => n + 1);
    if (!window.matchMedia("(min-width: 1024px)").matches) setMobileTab("grimoire");
  }, [language, state.finalCode, state.phase]);

  useEffect(() => {
    if (!mobileTabMounted.current) { mobileTabMounted.current = true; return; }
    if (!window.matchMedia("(max-width: 1023.98px)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`panel-${mobileTab}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
    if (!state.summary || !state.finalCode || !state.originalCode || state.running) return;
    const entry: GrimoireHistoryEntry = {
      id: createHistoryId(), createdAt: state.logs[0]?.ts ?? new Date().toISOString(), filename, directive, language,
      preview: historyPreview(state.originalCode), engine: state.engine, summary: state.summary,
      originalCode: state.originalCode, purifiedCode: state.finalCode, findings: state.findings, appliedFixes: state.appliedFixes, logs: slimHistoryLogs(state.logs),
    };
    const fingerprint = historyFingerprint(entry);
    if (lastHistoryFingerprint.current === fingerprint) return;
    lastHistoryFingerprint.current = fingerprint; addEntry(entry);
  }, [addEntry, directive, filename, language, state.appliedFixes, state.engine, state.finalCode, state.findings, state.logs, state.originalCode, state.running, state.summary]);

  const triggerRitualFx = () => {
    setFxFlash(true); setFxShake(true);
    window.setTimeout(() => setFxFlash(false), 550);
    window.setTimeout(() => setFxShake(false), 420);
  };

  const handleSelectPreset = (id: string) => {
    const artifact = findArtifact(id); if (!artifact) return;
    setCode(artifact.code); setFilename(`cursed-${artifact.id}.${extensionFor(artifact.language)}`); setLanguage(artifact.language); setSelectedPresetId(artifact.id); play("click");
  };
  const handleCodeChange = (value: string) => { setCode(value); setSelectedPresetId(null); };
  const handleRun = () => {
    if (state.running) return; lastSonifiedSeq.current = -1; play("dhum"); triggerRitualFx(); setMobileTab("ritual"); void run({ code, directive, language, sigils });
  };
  const handleAutoDemo = () => {
    if (state.running) return; lastSonifiedSeq.current = -1; play("dhum"); triggerRitualFx();
    const artifact = findArtifact(AUTO_DEMO_ARTIFACT_ID); if (!artifact) return;
    setCode(artifact.code); setDirective(AUTO_DEMO_DIRECTIVE); setFilename(`cursed-${artifact.id}.${extensionFor(artifact.language)}`); setLanguage(artifact.language); setSelectedPresetId(artifact.id);
    setAutoDemoNonce((n) => n + 1); setMobileTab("ritual"); void run({ code: artifact.code, directive: AUTO_DEMO_DIRECTIVE, language: artifact.language, sigils });
  };
  const handleReset = () => { lastSonifiedSeq.current = -1; play("click"); reset(); };
  const handleRestore = (entry: GrimoireHistoryEntry) => {
    lastHistoryFingerprint.current = historyFingerprint(entry); lastSonifiedSeq.current = entry.logs.at(-1)?.seq ?? -1;
    setCode(entry.originalCode); setDirective(entry.directive); setFilename(entry.filename);
    const restoredLanguage = entry.language ?? languageIdFromFilename(entry.filename) ?? DEFAULT_LANGUAGE;
    setLanguage(isLanguageId(restoredLanguage) ? restoredLanguage : DEFAULT_LANGUAGE); setSelectedPresetId(null);
    restore({ logs: entry.logs, summary: entry.summary, finalCode: entry.purifiedCode, originalCode: entry.originalCode, findings: entry.findings, appliedFixes: entry.appliedFixes, engine: entry.engine });
    setHistoryOpen(false); setMobileTab("grimoire"); play("click");
  };
  const handleFxToggle = (key: keyof UiSettings) => { if (key !== "soundOn" || !settings.soundOn) play("click"); toggle(key); };

  const mobilePanel = (tab: MobileTab) => [
    mobileTab === tab ? "flex" : "hidden",
    "scroll-mt-20 flex-col max-h-[78dvh] [&>*]:min-h-0 [&>*]:flex-1",
    tab === "ritual" ? "min-h-[max(420px,58dvh)]" : "min-h-[420px]",
    "lg:hidden",
  ].join(" ");

  return (
    <main className={`relative h-[100dvh] overflow-hidden bg-void ${fxShake ? "screen-shake" : ""}`}>
      <audio ref={bgmRef} src="/audio/horror-bgm.mp3" loop preload="auto" aria-hidden="true" className="hidden" />

      <div className="absolute inset-0 z-0">
        <WebGLBoundary fallback={<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(60,0,15,0.35),#030105_70%)]" />}>
          <HorrorBackdrop aura={aura} />
        </WebGLBoundary>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(3,1,5,0.35)_60%,rgba(3,1,5,0.88)_100%)]" />
        {settings.fogOn && (
          <>
            <div className="fog-layer pointer-events-none absolute inset-0 animate-fog-drift opacity-70" />
            <div aria-hidden className="crimson-tendrils pointer-events-none absolute inset-0" />
          </>
        )}
        <div className="haunted-grid pointer-events-none absolute inset-0 opacity-20" />
        {settings.scanlinesOn && <div className="crt-overlay animate-flicker" aria-hidden />}
      </div>

      <div aria-hidden className="breathing-vignette pointer-events-none absolute inset-0 z-[5]" />
      <div aria-hidden className="corner-vignette pointer-events-none absolute inset-0 z-[25]" />

      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
        <header className="pointer-events-auto relative z-50 flex shrink-0 items-center justify-between gap-3 overflow-visible px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-[#07050a]/55 px-3 py-2 backdrop-blur-xl">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-crimson/45 bg-black/60 shadow-[0_0_24px_rgba(255,0,60,0.22)]">
              <span className="pointer-events-none absolute -inset-1.5 animate-[spin_26s_linear_infinite] rounded-full border border-dashed border-haunt/25" />
              <Skull className="h-5 w-5 text-crimson" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="font-brand text-lg font-bold uppercase tracking-[0.16em] text-[#EDE6D6] [text-shadow:0_0_18px_rgba(255,0,60,0.22)]">NecroCode</h1>
                <span className="hidden font-mono text-[12px] uppercase tracking-[0.2em] text-zinc-400 sm:inline">Ritual Chamber</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">
                <span className={`h-1.5 w-1.5 rounded-full ${liveEngineActive ? "animate-pulse bg-neon shadow-[0_0_8px_rgba(0,255,102,0.9)]" : "bg-zinc-400"}`} />
                <span>{liveEngineActive ? "Live AI engine" : "Builtin safety net"}</span>
              </div>
            </div>
          </div>

          <nav aria-label="Studio controls" className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/10 bg-[#07050a]/55 p-2 pr-4 backdrop-blur-xl">
            <button type="button" onClick={handleAutoDemo} disabled={state.running} className="blood-cta h-10 px-4 text-[12px]">
              <Sparkles className="h-4 w-4" aria-hidden />Auto Demo
            </button>
            <button type="button" onClick={() => { play("click"); setHistoryOpen(false); setApiOpen(true); }} aria-haspopup="dialog" className="obsidian-pill"><KeyRound className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">API Sigils</span></button>
            <button type="button" onClick={() => { play("click"); setApiOpen(false); setHistoryOpen(true); }} aria-haspopup="dialog" className="obsidian-pill"><History className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">History</span><span className="rounded border border-white/15 px-1 py-px text-[12px] leading-none text-zinc-300">{entries.length}</span></button>
            <FxMenu settings={settings} onToggle={handleFxToggle} className="obsidian-pill aria-expanded:border-white/25 aria-expanded:bg-white/[0.06]" />
          </nav>
        </header>

        <AnimatePresence>
          {state.error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="pointer-events-auto mx-4 mt-1 flex items-center gap-2 rounded-xl border border-crimson/40 bg-crimson/10 px-4 py-2 font-mono text-[13px] text-crimson backdrop-blur-md lg:mx-6">
              <AlertTriangle className="h-4 w-4" aria-hidden />{state.error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(285px,315px)_1fr_minmax(300px,335px)] gap-3 px-3 pb-3">
          <div className="pointer-events-auto hidden min-h-0 lg:block">
            <ControlPanel code={code} onCodeChange={handleCodeChange} directive={directive} onDirectiveChange={setDirective} filename={filename} onFilenameChange={setFilename} language={language} onLanguageChange={setLanguage} onSelectPreset={handleSelectPreset} selectedPresetId={selectedPresetId} onRun={handleRun} onReset={handleReset} running={state.running} phase={state.phase} progress={state.progress} />
          </div>
          <div className="pointer-events-auto hidden min-h-0 lg:block">
            <AgentCanvas nodes={state.nodes} activeStage={state.activeStage} bugCount={state.bugCount} aura={aura} progress={state.progress} running={state.running} phase={state.phase} summary={state.summary} logs={state.logs} engine={state.engine} scanlines={settings.scanlinesOn} graphMode={settings.graphMode} fxEnabled={settings.soundOn} />
          </div>
          <div className="pointer-events-auto hidden min-h-0 lg:block">
            <Terminal logs={state.logs} running={state.running} scanlines={settings.scanlinesOn} summary={state.summary} finalCode={state.finalCode} originalCode={state.originalCode} findings={state.findings} appliedFixes={state.appliedFixes} engine={state.engine} language={language} filename={filename} onCopied={() => play("copy")} onExported={() => play("click")} onSandbox={() => play("click")} autoDemoNonce={autoDemoNonce} autoRunNonce={isDesktop ? autoRunNonce : 0} />
          </div>
          <div className="pointer-events-auto col-span-full flex min-h-0 flex-col lg:hidden">
            <div role="tablist" aria-label="Studio panel" className="mb-3 flex gap-1.5 rounded-xl border border-white/10 bg-[#07050a]/70 p-1.5 backdrop-blur-xl">
              {MOBILE_TABS.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={mobileTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setMobileTab(tab.id)} className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border font-sans text-[13px] font-semibold uppercase tracking-[0.08em] transition ${mobileTab === tab.id ? "border-crimson/60 bg-crimson/10 text-[#EDE6D6]" : "border-white/10 bg-black/25 text-zinc-300"}`}>
                  {tab.label}{tab.id === "ritual" && state.running && <span className="h-2 w-2 animate-pulse rounded-full bg-crimson" aria-hidden />}
                </button>
              ))}
            </div>
            <div id="panel-spellbook" className={mobilePanel("spellbook")}>
              <ControlPanel code={code} onCodeChange={handleCodeChange} directive={directive} onDirectiveChange={setDirective} filename={filename} onFilenameChange={setFilename} language={language} onLanguageChange={setLanguage} onSelectPreset={handleSelectPreset} selectedPresetId={selectedPresetId} onRun={handleRun} onReset={handleReset} running={state.running} phase={state.phase} progress={state.progress} />
            </div>
            <div id="panel-ritual" className={mobilePanel("ritual")}>
              <div className="glass-obsidian dock-sigil relative h-full overflow-hidden rounded-2xl">
                <AgentCanvas nodes={state.nodes} activeStage={state.activeStage} bugCount={state.bugCount} aura={aura} progress={state.progress} running={state.running} phase={state.phase} summary={state.summary} logs={state.logs} engine={state.engine} scanlines={settings.scanlinesOn} graphMode={settings.graphMode} fxEnabled={settings.soundOn} />
              </div>
            </div>
            <div id="panel-grimoire" className={mobilePanel("grimoire")}>
              <Terminal logs={state.logs} running={state.running} scanlines={settings.scanlinesOn} summary={state.summary} finalCode={state.finalCode} originalCode={state.originalCode} findings={state.findings} appliedFixes={state.appliedFixes} engine={state.engine} language={language} filename={filename} onCopied={() => play("copy")} onExported={() => play("click")} onSandbox={() => play("click")} autoDemoNonce={autoDemoNonce} autoRunNonce={isDesktop ? 0 : autoRunNonce} />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>{fxFlash && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="blood-flash pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(circle_at_center,rgba(255,0,60,0.28),rgba(255,0,60,0.08)_35%,transparent_70%)]" />}</AnimatePresence>

      <BatSwarmOverlay running={state.running} activeStage={state.activeStage} />

      <ApiSigilsModal open={apiOpen} sigils={sigils} onClose={() => setApiOpen(false)} onSave={saveSigils} onClear={clearSigils} />
      <HistoryDrawer open={historyOpen} entries={entries} onClose={() => setHistoryOpen(false)} onRestore={handleRestore} onClear={clearHistory} />
    </main>
  );
}
