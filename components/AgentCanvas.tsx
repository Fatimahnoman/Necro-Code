"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { supportsWebGL, WebGLBoundary } from "@/components/WebGLBoundary";
import { AURA_HEX, AURA_LABEL, type AuraState } from "@/lib/aura";
import type {
  AgentEvent,
  AgentPhase,
  EngineInfo,
  ExorcismSummary,
  NodeStatus,
  StageId,
} from "@/lib/types";
import { WORKFLOW_STAGES } from "@/lib/types";
import type { NodeStatusMap } from "@/lib/useAgentStream";

const ExecutionGraph3D = dynamic(
  () => import("@/components/three/ExecutionGraph3D").then((mod) => mod.ExecutionGraph3D),
  { ssr: false, loading: () => <GraphFallback /> },
);

type GraphMode = "2d" | "3d";

const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: "DORMANT",
  active: "CHANNELLING",
  done: "SEALED",
  error: "CURSED",
};

const STATUS_HEX: Record<NodeStatus, string> = {
  pending: "#8A7D62",
  active: AURA_HEX.purple,
  done: AURA_HEX.green,
  error: AURA_HEX.crimson,
};

const TIMELINE_STEPS: Array<{ id: StageId; label: string; index: string }> = [
  { id: "input_code", label: "CORRUPTED", index: "1" },
  { id: "glitch_scanner", label: "SCANNER", index: "2" },
  { id: "exorcism_reasoning", label: "EXORCISM", index: "3" },
  { id: "clean_code_output", label: "PURIFIED", index: "4" },
];

function formatMs(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

/**
 * Measure a stage from its first event to the next stage's first event, so the
 * scanner's time is not swallowed by the later "corruption cleared" event.
 */
function stageDurationMs(
  logs: AgentEvent[],
  stageId: StageId,
  status: NodeStatus,
  now: number,
): number | null {
  const firstIndex = logs.findIndex((log) => log.stage === stageId);
  if (firstIndex === -1) return null;
  const firstMs = Date.parse(logs[firstIndex].ts);
  if (!Number.isFinite(firstMs)) return null;
  const order = WORKFLOW_STAGES.findIndex((stage) => stage.id === stageId);

  let endMs: number | null = null;
  for (let index = firstIndex + 1; index < logs.length; index++) {
    const log = logs[index];
    if (log.phase === "complete") {
      endMs = Date.parse(log.ts);
      break;
    }
    if (log.stage) {
      const nextOrder = WORKFLOW_STAGES.findIndex((stage) => stage.id === log.stage);
      if (nextOrder > order) {
        endMs = Date.parse(log.ts);
        break;
      }
    }
  }
  if (endMs === null) {
    const lastStageLog = [...logs].reverse().find((log) => log.stage === stageId);
    const lastMs = lastStageLog ? Date.parse(lastStageLog.ts) : firstMs;
    endMs = status === "active" ? now || lastMs : Number.isFinite(lastMs) ? lastMs : firstMs;
  }
  return Number.isFinite(endMs) ? Math.max(0, endMs - firstMs) : null;
}

function totalDurationMs(logs: AgentEvent[], now: number, running: boolean): number | null {
  if (logs.length === 0) return null;
  const firstMs = Date.parse(logs[0].ts);
  const lastMs = Date.parse(logs[logs.length - 1].ts);
  if (!Number.isFinite(firstMs)) return null;
  const endMs = running ? now || lastMs : lastMs;
  return Number.isFinite(endMs) ? Math.max(0, endMs - firstMs) : null;
}

function GraphFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 animate-spin rounded-full border border-dashed border-haunt/40" />
          <span className="absolute inset-2 animate-[spin_3s_linear_infinite_reverse] rounded-full border border-crimson/30" />
          <span className="h-2 w-2 rounded-full bg-crimson shadow-[0_0_18px_rgba(255,0,60,0.9)]" />
        </div>
        <p className="font-mono text-[13px] uppercase tracking-[0.3em] text-zinc-300">
          Summoning the 3D ritual…
        </p>
      </div>
    </div>
  );
}

/** Lightweight DOM pipeline used for reduced motion, no WebGL, or 2D mode. */
function RitualGraph2D({
  nodes,
  bugCount,
  selected,
  onSelect,
  stageMeta,
}: {
  nodes: NodeStatusMap;
  bugCount: number;
  selected: StageId | null;
  onSelect: (stage: StageId) => void;
  stageMeta: Partial<Record<StageId, string>>;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4 pb-[168px] pt-[116px]">
      <ol aria-label="Ritual pipeline" className="flex w-full max-w-[440px] flex-col items-stretch">
        {WORKFLOW_STAGES.map((stage, index) => {
          const status = nodes[stage.id];
          const color = STATUS_HEX[status];
          const isSelected = selected === stage.id;
          const isActive = status === "active";
          const lit = status !== "pending";
          return (
            <li key={stage.id} className="flex flex-col items-center">
              {index > 0 && (
                <span
                  aria-hidden
                  className="my-1 h-5 w-px"
                  style={{
                    background: lit
                      ? `linear-gradient(${STATUS_HEX[nodes[WORKFLOW_STAGES[index - 1].id]]}, ${color})`
                      : "rgba(255,255,255,0.15)",
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(stage.id)}
                aria-pressed={isSelected}
                aria-label={`${stage.label}: ${STATUS_LABEL[status]}${
                  stage.id === "glitch_scanner" && bugCount > 0 ? `, ${bugCount} bugs` : ""
                }`}
                data-stage-2d={stage.id}
                data-status={status}
                className={[
                  "relative flex w-full items-center gap-3 rounded-xl border bg-[#0a0b14]/90 px-3 py-2.5 text-left transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                  isSelected ? "ring-2 ring-white/35" : "",
                  isActive ? "motion-safe:animate-pulse" : "",
                ].join(" ")}
                style={{
                  borderColor: `${color}${lit ? "99" : "40"}`,
                  boxShadow: lit
                    ? `0 0 ${isSelected ? 26 : 18}px ${color}33, inset 0 0 16px ${color}14`
                    : "none",
                }}
              >
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border font-brand text-[13px]"
                  style={{
                    borderColor: `${color}80`,
                    color: lit ? color : "#A1A1AA",
                    background: `${color}14`,
                  }}
                >
                  {stage.glyph}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-brand text-[13px] font-bold uppercase leading-tight tracking-[0.06em] text-bone">
                    {stage.label}
                  </span>
                  <span
                    className="mt-0.5 block font-mono text-[12px] uppercase tracking-[0.1em]"
                    style={{ color: lit ? color : "#A1A1AA" }}
                  >
                    {stageMeta[stage.id] ?? STATUS_LABEL[status]}
                  </span>
                </span>
                {stage.id === "glitch_scanner" && bugCount > 0 && (
                  <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full border border-crimson/60 bg-crimson px-1.5 font-mono text-[12px] font-bold text-black shadow-[0_0_16px_rgba(255,0,60,0.7)]">
                    {bugCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface AgentCanvasProps {
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  bugCount?: number;
  aura: AuraState;
  progress: number;
  running: boolean;
  phase: AgentPhase;
  summary: ExorcismSummary | null;
  logs: AgentEvent[];
  engine: EngineInfo;
  scanlines?: boolean;
  graphMode?: GraphMode;
  /** Mirrors the `3D AUDIO FX` toggle for in-scene sound cues. */
  fxEnabled?: boolean;
}

export function AgentCanvas({
  nodes,
  activeStage,
  bugCount = 0,
  aura,
  progress,
  running,
  phase,
  summary,
  logs,
  engine,
  scanlines = true,
  graphMode = "3d",
  fxEnabled = false,
}: AgentCanvasProps) {
  const [selected, setSelected] = useState<StageId | null>(null);
  const [now, setNow] = useState(0);
  const [auto2D, setAuto2D] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  // Reduced motion or missing WebGL forces the 2D fallback regardless of the
  // user's FX preference. Mount-safe: the first client render still matches SSR.
  useEffect(() => {
    const ok = supportsWebGL();
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAuto2D(!ok || query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const mode: GraphMode = auto2D || webglFailed || graphMode === "2d" ? "2d" : "3d";
  const fallbackReason = webglFailed
    ? "2D fallback active · WebGL unavailable"
    : auto2D
      ? "2D fallback active · reduced motion"
      : mode === "2d"
        ? "2D ritual stage"
        : null;

  // Exorcism climax: emerald purification flare when a run ends clean, a
  // shorter crimson pulse when corruption remains. Skipped under reduced motion.
  const climaxRef = useRef<HTMLDivElement>(null);
  const wasRunning = useRef(running);
  useEffect(() => {
    const ended = wasRunning.current && !running;
    wasRunning.current = running;
    const element = climaxRef.current;
    if (!ended || !element || !summary) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const purified = summary.unresolved === 0;
    element.style.background = purified
      ? "radial-gradient(circle at 50% 42%, rgba(220,255,235,0.9), rgba(0,255,102,0.5) 25%, rgba(0,255,102,0) 70%)"
      : "radial-gradient(circle at 50% 42%, rgba(255,0,60,0.5), rgba(255,0,60,0) 65%)";
    element.animate(
      purified
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.5, offset: 0.4 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 0.8, offset: 0.2 }, { opacity: 0 }],
      { duration: purified ? 2200 : 900, easing: "ease-out" },
    );
  }, [running, summary]);

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);

  const selectedStage = WORKFLOW_STAGES.find((stage) => stage.id === selected);
  const selectedStatus = selectedStage ? nodes[selectedStage.id] : null;
  const auraHex = AURA_HEX[aura];
  const severity = useMemo(() => {
    if (summary) {
      return {
        critical: summary.critical,
        warning: summary.warning,
        info: summary.info,
        detected: summary.detected,
        fixed: summary.fixed,
        unresolved: summary.unresolved,
      };
    }
    const counts = { critical: 0, warning: 0, info: 0, detected: 0, fixed: 0, unresolved: 0 };
    for (const log of logs) {
      if (!log.bug) continue;
      counts.detected += 1;
      counts[log.bug.severity] += 1;
    }
    return counts;
  }, [logs, summary]);

  const stageMeta = useMemo(() => {
    const meta: Partial<Record<StageId, string>> = {};
    for (const stage of WORKFLOW_STAGES) {
      const status = nodes[stage.id];
      const ms = stageDurationMs(logs, stage.id, status, now);
      meta[stage.id] = ms === null ? STATUS_LABEL[status] : `${STATUS_LABEL[status]} · ${formatMs(ms)}`;
    }
    return meta;
  }, [logs, nodes, now]);

  const stageMs = selectedStage && selectedStatus
    ? stageDurationMs(logs, selectedStage.id, selectedStatus, now)
    : null;
  const ritualMs = totalDurationMs(logs, now, running);
  const showHelper = phase === "idle" && !running && logs.length === 0;

  const handleWebGLFailure = () => {
    setWebglFailed(true);
    setSelected(null);
  };

  return (
    <section data-ritual-canvas className="relative h-full min-h-[420px] w-full overflow-hidden">
      <div
        ref={climaxRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[25] opacity-0 mix-blend-screen"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,0,10,0.12),transparent_45%,rgba(0,0,0,0.55)_100%)]" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 45%, ${auraHex}12, transparent 55%)` }}
      />

      <div className="absolute inset-0 z-10">
        {mode === "2d" ? (
          <RitualGraph2D
            nodes={nodes}
            bugCount={bugCount}
            selected={selected}
            onSelect={setSelected}
            stageMeta={stageMeta}
          />
        ) : (
          <WebGLBoundary
            fallback={<GraphFallback />}
            onError={handleWebGLFailure}
          >
            <ExecutionGraph3D
              nodes={nodes}
              activeStage={activeStage}
              bugCount={bugCount}
              aura={aura}
              selected={selected}
              onSelect={setSelected}
              onClear={() => setSelected(null)}
              reserveTopPx={64}
              reserveBottomPx={84}
              onContextLost={handleWebGLFailure}
              running={running}
              fxEnabled={fxEnabled}
            />
          </WebGLBoundary>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_38%,rgba(3,1,5,0.35)_72%,rgba(3,1,5,0.72)_100%)]" />
      {scanlines && <div className="crt-overlay animate-flicker" aria-hidden />}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-3 text-center">
        <p className="font-brand text-[12px] font-bold uppercase tracking-[0.28em] text-[#EDE6D6]/70">
          Ritual Altar
        </p>
        <p className="mt-1 font-mono text-[12px] uppercase tracking-[0.2em] text-zinc-400">
          {mode === "2d" ? "Click a stage seal to inspect" : "Drag to orbit · click a seal to inspect"}
        </p>
      </div>

      <div className="pointer-events-none absolute right-4 top-20 z-30 flex flex-col items-end gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border bg-black/45 px-3 py-1 font-mono text-[12px] uppercase tracking-[0.18em] backdrop-blur-md"
          style={{ borderColor: `${auraHex}66`, color: auraHex, boxShadow: `0 0 20px ${auraHex}22` }}
        >
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ backgroundColor: auraHex, boxShadow: `0 0 8px ${auraHex}` }}
          />
          {AURA_LABEL[aura]}
        </span>
        <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-300 backdrop-blur-md">
          Bugs <span className="text-crimson">{bugCount}</span>
        </span>
        {fallbackReason && (
          <span className="rounded-full border border-spectral/30 bg-spectral/10 px-3 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-spectral backdrop-blur-md">
            {fallbackReason}
          </span>
        )}
      </div>

      <AnimatePresence>
        {selectedStage && selectedStatus && (
          <motion.div
            key={selectedStage.id}
            data-seal-hud
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            className="pointer-events-auto absolute bottom-20 left-3 right-3 z-30 rounded-xl border border-white/20 bg-[#0b0812]/95 p-3.5 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="font-brand text-[14px] uppercase tracking-[0.16em]"
                  style={{ color: STATUS_HEX[selectedStatus] }}
                >
                  {selectedStage.glyph} {selectedStage.label}
                </p>
                <p className="mt-1 font-mono text-[13px] leading-snug text-zinc-300">
                  {selectedStage.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className="rounded-full border px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.14em]"
                  style={{
                    borderColor: `${STATUS_HEX[selectedStatus]}55`,
                    color: STATUS_HEX[selectedStatus],
                  }}
                >
                  {STATUS_LABEL[selectedStatus]}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close seal details"
                  className="grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-white/5 font-sans text-[18px] leading-none text-zinc-300 transition hover:border-crimson/50 hover:text-crimson"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-400">
                  Active engine
                </p>
                <p className="mt-0.5 break-words font-mono text-[13px] font-semibold uppercase text-spectral">
                  {engine.name}
                </p>
                <p className="break-words font-mono text-[12px] text-zinc-400">{engine.model}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-400">
                  Latency ms
                </p>
                <p className="mt-0.5 font-mono text-[13px] font-semibold text-[#EDE6D6]">
                  {formatMs(stageMs)}
                </p>
                <p className="font-mono text-[12px] text-zinc-400">ritual {formatMs(ritualMs)}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.1em]">
              <span className="text-zinc-400">Severity breakdown</span>
              <span className="rounded border border-crimson/25 bg-crimson/5 px-1.5 py-0.5 text-crimson">
                crit {severity.critical}
              </span>
              <span className="rounded border border-amber-400/25 bg-amber-400/5 px-1.5 py-0.5 text-amber-300">
                warn {severity.warning}
              </span>
              <span className="rounded border border-spectral/25 bg-spectral/5 px-1.5 py-0.5 text-spectral">
                info {severity.info}
              </span>
              <span className="ml-auto text-zinc-400">
                {severity.detected} detected · {severity.fixed} fixed
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-1">
        <div className="pointer-events-auto mx-auto max-w-[540px] rounded-2xl border border-white/10 bg-[#07050a]/72 px-3 py-2 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[540px] grid-cols-4 gap-2">
            {TIMELINE_STEPS.map((step) => {
              const status = nodes[step.id];
              const color = STATUS_HEX[status];
              const active = selected === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setSelected(step.id)}
                  aria-pressed={active}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-2 py-1.5 text-center transition ${
                    active
                      ? "border-crimson/60 bg-crimson/10"
                      : "border-white/10 bg-black/25 hover:border-white/20"
                  }`}
                  style={{ boxShadow: status !== "pending" ? `0 0 20px ${color}18` : undefined }}
                >
                  <span className="flex min-w-0 items-center justify-center gap-1 font-sans text-[12px] font-semibold uppercase leading-tight tracking-[0.04em] text-[#EDE6D6]">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                    />
                    <span className="truncate">{step.index}. {step.label}</span>
                  </span>
                  <span
                    className="block font-mono text-[12px] uppercase leading-none tracking-[0.1em]"
                    style={{ color }}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] uppercase leading-none tracking-[0.16em] text-zinc-400">
            <span>
              {showHelper
                ? "Paste or summon code → Ignite EXORCISE CODE → Click any glowing seal to inspect"
                : "Click any glowing seal to inspect"}
            </span>
            <span
              className={
                running
                  ? "text-crimson"
                  : phase === "complete"
                    ? "text-neon"
                    : "text-zinc-400"
              }
            >
              {running
                ? `ritual ${progress}%`
                : summary
                  ? summary.unresolved > 0
                    ? "residual curse"
                    : "sealed"
                  : "awaiting offering"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
