"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { supportsWebGL, WebGLBoundary } from "@/components/WebGLBoundary";
import {
  AURA_HEX,
  AURA_LABEL,
  type AuraState,
} from "@/lib/aura";
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
  () =>
    import("@/components/three/ExecutionGraph3D").then(
      (mod) => mod.ExecutionGraph3D,
    ),
  {
    ssr: false,
    loading: () => <GraphFallback />,
  },
);

const STATUS_LABEL: Record<NodeStatus, string> = {
  pending: "DORMANT",
  active: "CHANNELLING",
  done: "SEALED",
  error: "CURSED",
};

const STATUS_HEX: Record<NodeStatus, string> = {
  pending: "#64748B",
  active: AURA_HEX.purple,
  done: AURA_HEX.green,
  error: AURA_HEX.crimson,
};

const HELPER_STEPS = [
  "Paste or fetch code",
  "Click EXORCISE CODE",
  "Click any 3D seal to inspect",
] as const;

const HELPER_STEPS_2D = [
  "Paste or fetch code",
  "Click EXORCISE CODE",
  "Click any stage to inspect",
] as const;

/** Bottom strip reserved for the first-run helper (up to two wrapped lines). */
const FOOTER_HELPER_PX = 64;
/** Top strip reserved for the panel header (title, view toggle, hint, aura). */
const GRAPH_TOP_PX = 80;

type GraphMode = "2d" | "3d";

/**
 * Lightweight 2D ritual pipeline: the same four stages, SSE status colors,
 * bug badge, and click-to-inspect as the 3D graph, rendered as plain DOM.
 * Used when the user picks 2D, `prefers-reduced-motion` is set, or WebGL is
 * unavailable or lost.
 */
function RitualGraph2D({
  nodes,
  activeStage,
  bugCount,
  selected,
  onSelect,
  onClear,
  reserveTopPx,
  reserveBottomPx,
}: {
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  bugCount: number;
  selected: StageId | null;
  onSelect: (stage: StageId) => void;
  onClear: () => void;
  reserveTopPx: number;
  reserveBottomPx: number;
}) {
  return (
    <div
      data-graph-mode="2d"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClear();
      }}
      className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4"
      style={{ paddingTop: reserveTopPx, paddingBottom: reserveBottomPx + 8 }}
    >
      <ol
        aria-label="Ritual pipeline"
        className="flex w-full max-w-[360px] flex-col items-stretch"
      >
        {WORKFLOW_STAGES.map((stage, index) => {
          const status = nodes[stage.id];
          const color = STATUS_HEX[status];
          const isSelected = selected === stage.id;
          const isActive = activeStage === stage.id && status === "active";
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
                  stage.id === "glitch_scanner" && bugCount > 0
                    ? `, ${bugCount} bugs`
                    : ""
                }`}
                data-stage-2d={stage.id}
                data-status={status}
                className={[
                  "relative flex w-full items-center gap-3 rounded-xl border bg-[#0a0b14]/90 px-3 py-2.5 text-left transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
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
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border font-mono text-[15px]"
                  style={{
                    borderColor: `${color}80`,
                    color: lit ? color : "#A1A1AA",
                    background: `${color}14`,
                  }}
                >
                  {stage.glyph}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] font-medium uppercase leading-tight tracking-[0.06em] text-zinc-100">
                    {stage.label}
                  </span>
                  <span
                    className="mt-0.5 block font-mono text-[12px] uppercase tracking-[0.1em]"
                    style={{ color: lit ? color : "#A1A1AA" }}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </span>
                {stage.id === "glitch_scanner" && bugCount > 0 && (
                  <span
                    data-bug-badge
                    className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full border border-crimson/60 bg-crimson px-1.5 font-mono text-[12px] font-bold text-black shadow-[0_0_16px_rgba(255,0,60,0.7)]"
                  >
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

function formatMs(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

/**
 * Measure a stage from its first event to the next stage's first event.
 * This keeps the scanner's time separate from the later "corruption cleared"
 * event, which is emitted after the reasoning stage.
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
      const nextOrder = WORKFLOW_STAGES.findIndex(
        (stage) => stage.id === log.stage,
      );
      if (nextOrder > order) {
        endMs = Date.parse(log.ts);
        break;
      }
    }
  }

  if (endMs === null) {
    const lastStageLog = [...logs]
      .reverse()
      .find((log) => log.stage === stageId);
    const lastMs = lastStageLog ? Date.parse(lastStageLog.ts) : firstMs;
    endMs =
      status === "active"
        ? now || lastMs
        : Number.isFinite(lastMs)
          ? lastMs
          : firstMs;
  }

  return Number.isFinite(endMs) ? Math.max(0, endMs - firstMs) : null;
}

function totalDurationMs(
  logs: AgentEvent[],
  now: number,
  running: boolean,
): number | null {
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
          <span className="absolute inset-2 animate-[spin_3s_linear_infinite_reverse] rounded-full border border-blood/30" />
          <span className="h-2 w-2 rounded-full bg-crimson shadow-[0_0_18px_rgba(255,0,60,0.9)]" />
        </div>
        <p className="font-mono text-[13px] uppercase tracking-[0.3em] text-zinc-300">
          Summoning the 3D ritual…
        </p>
      </div>
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
}: AgentCanvasProps) {
  const [selected, setSelected] = useState<StageId | null>(null);
  const [now, setNow] = useState(0);

  // 2D / 3D view. `autoMode` stays null until mounted so SSR and the first
  // client render match; it resolves to 2D for reduced motion or no WebGL.
  const [autoMode, setAutoMode] = useState<GraphMode | null>(null);
  const [userMode, setUserMode] = useState<GraphMode | null>(null);
  const [webglOk, setWebglOk] = useState(true);

  useEffect(() => {
    const ok = supportsWebGL();
    setWebglOk(ok);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAutoMode(!ok || query.matches ? "2d" : "3d");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const mode: GraphMode | null = !webglOk ? "2d" : (userMode ?? autoMode);
  const disableWebGL = () => {
    setWebglOk(false);
    setSelected(null);
  };

  useEffect(() => {
    setNow(Date.now());
    if (!running || !selected) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running, selected]);

  const selectedStage = WORKFLOW_STAGES.find((stage) => stage.id === selected);
  const selectedStatus = selectedStage ? nodes[selectedStage.id] : null;
  const auraHex = AURA_HEX[aura];

  const severity = useMemo(() => {
    const counts = {
      critical: 0,
      warning: 0,
      info: 0,
      detected: 0,
      fixed: 0,
      unresolved: 0,
    };
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
    for (const log of logs) {
      if (!log.bug) continue;
      counts.detected += 1;
      counts[log.bug.severity] += 1;
    }
    return counts;
  }, [logs, summary]);

  const stageMs =
    selectedStage && selectedStatus
      ? stageDurationMs(logs, selectedStage.id, selectedStatus, now)
      : null;
  const ritualMs = totalDurationMs(logs, now, running);

  /** First-run guide: only before any ritual has produced events. */
  const showHelper = phase === "idle" && !running && logs.length === 0;
  const reserveBottomPx =
    phase === "complete" ? 104 : showHelper ? FOOTER_HELPER_PX : 44;

  const RITUAL_TIMELINE_STEPS: Array<{
    id: string;
    label: string;
    stageId: StageId;
  }> = [
    { id: "dormant", label: "DORMANT", stageId: "input_code" },
    { id: "scanning", label: "SCANNING", stageId: "glitch_scanner" },
    { id: "exorcising", label: "EXORCISING", stageId: "exorcism_reasoning" },
    { id: "purified", label: "PURIFIED", stageId: "clean_code_output" },
  ];

  return (
    <section
      className={`rune-border horror-panel relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-2xl bg-[#06060c]/55 ${
        scanlines ? "scanlines" : ""
      }`}
    >
      <div className="haunted-grid pointer-events-none absolute inset-0 opacity-[0.14]" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 44%, ${auraHex}0d, transparent 58%)`,
        }}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.15em] text-white">
              Ritual Graph
            </h2>
            <div
              role="group"
              aria-label="Graph view"
              className="pointer-events-auto flex rounded-md border border-white/15 bg-black/55 p-0.5 backdrop-blur-md"
            >
              {(["2d", "3d"] as const).map((option) => {
                const unavailable = option === "3d" && !webglOk;
                const pressed = mode === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={pressed}
                    disabled={unavailable}
                    onClick={() => {
                      setUserMode(option);
                      setSelected(null);
                    }}
                    title={
                      unavailable
                        ? "WebGL is unavailable on this device"
                        : option === "2d"
                          ? "Lightweight 2D pipeline"
                          : "Interactive WebGL ritual graph"
                    }
                    className={[
                      "h-6 min-w-[32px] rounded px-1.5 font-mono text-[12px] font-medium uppercase leading-none tracking-[0.06em] transition disabled:cursor-not-allowed disabled:opacity-40",
                      pressed
                        ? "bg-white/15 text-white"
                        : "text-zinc-300 hover:text-white",
                    ].join(" ")}
                  >
                    {option.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-1 font-mono text-[12px] uppercase tracking-[0.16em] text-zinc-300">
            {mode === "2d" ? "Click a stage to inspect" : "Drag to orbit · click a seal"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border bg-black/50 px-2.5 py-1 font-mono text-[13px] uppercase tracking-[0.22em] backdrop-blur-md"
            style={{
              borderColor: `${auraHex}66`,
              color: auraHex,
              boxShadow: `0 0 20px ${auraHex}22`,
            }}
          >
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{
                backgroundColor: auraHex,
                boxShadow: `0 0 8px ${auraHex}`,
              }}
            />
            {AURA_LABEL[aura]}
          </span>
          <span className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.2em] text-zinc-200 backdrop-blur-md">
            Bugs <span className="text-crimson">{bugCount}</span>
          </span>
        </div>
      </header>

      <div className="absolute inset-0 z-10 flex min-h-0 flex-1">
        {mode === null ? (
          <GraphFallback />
        ) : mode === "3d" ? (
          <WebGLBoundary onError={disableWebGL}>
            <ExecutionGraph3D
              nodes={nodes}
              activeStage={activeStage}
              bugCount={bugCount}
              aura={aura}
              selected={selected}
              onSelect={setSelected}
              onClear={() => setSelected(null)}
              reserveTopPx={GRAPH_TOP_PX}
              reserveBottomPx={reserveBottomPx}
              onContextLost={disableWebGL}
            />
          </WebGLBoundary>
        ) : (
          <RitualGraph2D
            nodes={nodes}
            activeStage={activeStage}
            bugCount={bugCount}
            selected={selected}
            onSelect={setSelected}
            onClear={() => setSelected(null)}
            reserveTopPx={GRAPH_TOP_PX}
            reserveBottomPx={reserveBottomPx}
          />
        )}
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 38%, rgba(6,6,12,0.72) 100%)",
        }}
      />

      <AnimatePresence>
        {selectedStage && selectedStatus && (
          <motion.div
            key={selectedStage.id}
            data-seal-hud
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            className={`absolute inset-x-3 z-40 overflow-hidden rounded-xl border border-white/10 bg-[#0a0b14]/95 px-3 pb-3 pt-3 backdrop-blur-xl ${
              phase === "complete" ? "bottom-[108px]" : "bottom-14"
            }`}
            style={{ boxShadow: `0 0 34px ${STATUS_HEX[selectedStatus]}22` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="font-display text-[14px] uppercase tracking-[0.22em]"
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
                  className="rounded-full border px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.18em]"
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
                  className="rounded-md border border-white/10 p-1 text-zinc-300 transition hover:border-crimson/40 hover:text-crimson"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div className="rounded-md border border-white/10 bg-white/[0.025] px-2 py-1.5">
                <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-zinc-300">
                  Active engine
                </p>
                <p className="mt-0.5 truncate font-mono text-[13px] font-semibold uppercase tracking-[0.12em] text-spectral">
                  {engine.name}
                </p>
                <p className="truncate font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">
                  {engine.model}
                </p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.025] px-2 py-1.5">
                <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-zinc-300">
                  Execution time
                </p>
                <p className="mt-0.5 truncate font-mono text-[13px] font-semibold tracking-[0.08em] text-bone">
                  {formatMs(stageMs)}
                </p>
                <p className="truncate font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">
                  ritual {formatMs(ritualMs)}
                </p>
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-zinc-300">
                Severity
              </span>
              <span className="rounded border border-crimson/25 bg-crimson/5 px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] text-crimson">
                crit {severity.critical}
              </span>
              <span className="rounded border border-amber-400/25 bg-amber-400/5 px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] text-amber-300">
                warn {severity.warning}
              </span>
              <span className="rounded border border-spectral/25 bg-spectral/5 px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] text-spectral">
                info {severity.info}
              </span>
              <span className="ml-auto font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-300">
                {severity.detected} detected · {severity.fixed} fixed
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "complete" ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0a0b14]/90 px-3 py-2 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1.5">
            {RITUAL_TIMELINE_STEPS.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setSelected(step.stageId)}
                aria-pressed={selected === step.stageId}
                className={[
                  "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1.5 font-mono text-[12px] font-medium uppercase leading-tight tracking-[0.06em] transition",
                  selected === step.stageId
                    ? "border-crimson/60 bg-crimson/10 text-crimson"
                    : "border-white/15 bg-black/50 text-zinc-200 hover:border-haunt/50 hover:text-haunt-glow",
                ].join(" ")}
              >
                <span className="max-w-full truncate">{step.label}</span>
                <span className="max-w-full truncate text-[12px] font-normal tracking-[0.06em] text-zinc-400">
                  {STATUS_LABEL[nodes[step.stageId]]}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[12px] uppercase tracking-[0.22em] text-zinc-300">
            <span>SSE ↔ 3D sync</span>
            <span className={running ? "text-crimson" : phase === "complete" ? "text-neon" : "text-zinc-300"}>
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
      ) : showHelper ? (
        <div
          data-ritual-helper
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0a0b14]/85 px-3 py-2.5 backdrop-blur-md"
        >
          <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-[12px] leading-snug text-zinc-200">
            {(mode === "2d" ? HELPER_STEPS_2D : HELPER_STEPS).map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="text-haunt-glow" aria-hidden>
                    →
                  </span>
                )}
                <span>
                  <span className="text-crimson">{index + 1}.</span> {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 p-3 font-mono text-[12px] uppercase tracking-[0.22em] text-zinc-300">
          <span>SSE ↔ 3D sync</span>
          <span className={running ? "text-crimson" : "text-zinc-300"}>
            {running
              ? `ritual ${progress}%`
              : summary
                ? summary.unresolved > 0
                  ? "residual curse"
                  : "sealed"
                : "awaiting offering"}
          </span>
        </div>
      )}
    </section>
  );
}
