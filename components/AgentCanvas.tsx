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
  pending: "#8A7D62",
  active: AURA_HEX.purple,
  done: AURA_HEX.green,
  error: AURA_HEX.crimson,
};

const HELPER_STEPS = [
  "Feed the Crypt",
  "Ignite EXORCISE CODE",
  "Inspect the Altar Seals",
] as const;

/** Same wording in 2D: the stage cards are the altar seals there. */
const HELPER_STEPS_2D = HELPER_STEPS;

/** Bottom strip reserved for the status line + four stage cards. */
const FOOTER_PX = 104;

/** Stage-card status words (the card title already names the stage). */
const CARD_STATUS: Record<NodeStatus, string> = {
  pending: "Awaiting",
  active: "Channelling",
  done: "Sealed",
  error: "Cursed",
};
/** Top strip reserved for the panel header (title, view toggle, hint, aura). */
const GRAPH_TOP_PX = 64;

type GraphMode = "2d" | "3d";

/**
 * Lightweight 2D ritual pipeline: the same four stages, SSE status colors,
 * bug badge, and click-to-inspect as the 3D graph, rendered as plain DOM.
 * Used when the user picks 2D, `prefers-reduced-motion` is set, or WebGL is
 * unavailable or lost.
 */
function RitualGraph2D({
  stageMeta,
  nodes,
  activeStage,
  bugCount,
  selected,
  onSelect,
  onClear,
  reserveTopPx,
  reserveBottomPx,
}: {
  stageMeta: Partial<Record<StageId, string>>;
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

/**
 * Cathedral nave behind the WebGL canvas: a central pointed arch with a
 * lancet window, flanking arcades, clustered piers, and rib vaulting, drawn
 * as low-contrast carved stone with a faint ruby glow. Purely decorative.
 */
function CathedralNave() {
  const arch = (x: number, w: number, spring: number, top: number) =>
    `M${x - w} 600 V${spring} Q${x - w} ${spring - (spring - top) * 0.72} ${x} ${top} Q${x + w} ${spring - (spring - top) * 0.72} ${x + w} ${spring} V600`;
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id="nave-stone" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#241a20" />
          <stop offset="1" stopColor="#0c080b" />
        </linearGradient>
        <radialGradient id="nave-glow" cx="0.5" cy="0.45" r="0.5">
          <stop offset="0" stopColor="#FF003C" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FF003C" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="600" fill="url(#nave-glow)" />
      {/* Rib vaulting. */}
      <g stroke="#3a2c33" strokeWidth="2" fill="none" opacity="0.7">
        <path d="M0 120 Q200 -40 400 120" />
        <path d="M40 150 Q200 10 360 150" />
        <path d="M0 40 L200 170 L400 40" />
      </g>
      {/* Side arcades. */}
      {[60, 340].map((x) => (
        <g key={x} fill="none" stroke="#3d2e36" strokeWidth="3" opacity="0.8">
          <path d={arch(x, 46, 260, 150)} fill="#0a0709" fillOpacity="0.6" />
          <path d={arch(x, 34, 270, 175)} strokeWidth="1.5" />
        </g>
      ))}
      {/* Central arch + lancet. */}
      <g fill="none" stroke="#4a3840" strokeWidth="4" opacity="0.85">
        <path d={arch(200, 92, 230, 40)} fill="#09060a" fillOpacity="0.55" />
        <path d={arch(200, 78, 240, 66)} strokeWidth="2" />
      </g>
      <path d={arch(200, 26, 170, 96).replace(/V600$/, "V250 H174 Z")} fill="#4A154B" fillOpacity="0.22" stroke="#5E4524" strokeWidth="1.5" />
      {/* Clustered piers. */}
      {[118, 282, 10, 390].map((x) => (
        <g key={x}>
          <rect x={x - 9} y="150" width="18" height="450" fill="url(#nave-stone)" opacity="0.85" />
          <rect x={x - 3} y="150" width="6" height="450" fill="#2e2329" opacity="0.8" />
          <rect x={x - 12} y="146" width="24" height="8" fill="#3a2c33" />
        </g>
      ))}
    </svg>
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
    // Tick while a ritual runs so the active stage's banner time advances.
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);

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

  /** Banner line 2 for every stage: "<STATUS> · <stage time>". */
  const stageMeta = useMemo(() => {
    const meta: Partial<Record<StageId, string>> = {};
    for (const stage of WORKFLOW_STAGES) {
      const status = nodes[stage.id];
      const ms = stageDurationMs(logs, stage.id, status, now);
      meta[stage.id] = ms === null ? STATUS_LABEL[status] : `${STATUS_LABEL[status]} · ${formatMs(ms)}`;
    }
    return meta;
  }, [logs, nodes, now]);

  const stageMs =
    selectedStage && selectedStatus
      ? stageDurationMs(logs, selectedStage.id, selectedStatus, now)
      : null;
  const ritualMs = totalDurationMs(logs, now, running);

  /** First-run guide: only before any ritual has produced events. */
  const showHelper = phase === "idle" && !running && logs.length === 0;
  const reserveBottomPx = FOOTER_PX;

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
      className={`rune-border horror-panel relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-2xl bg-[#040408]/55 ${
        scanlines ? "scanlines" : ""
      }`}
    >
      <CathedralNave />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 44%, ${auraHex}0d, transparent 58%)`,
        }}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
        <div>
          <div className="flex items-center gap-2">
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
                      "h-6 min-w-[32px] rounded px-1.5 font-sans text-[12px] font-bold uppercase leading-none tracking-[0.06em] transition disabled:cursor-not-allowed disabled:opacity-40",
                      pressed
                        ? "bg-gold/20 text-bone shadow-[inset_0_0_0_1px_rgba(226,217,200,0.45)]"
                        : "text-bone/70 hover:text-bone",
                    ].join(" ")}
                  >
                    {option.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-1 font-sans text-[12px] font-medium uppercase tracking-[0.14em] text-bone/75">
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
              running={running}
              stageMeta={stageMeta}
            />
          </WebGLBoundary>
        ) : (
          <RitualGraph2D
            stageMeta={stageMeta}
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
            className="absolute inset-x-3 bottom-[112px] z-40 overflow-hidden rounded-xl border border-white/10 bg-[#0a0b14]/95 px-3 pb-3 pt-3 backdrop-blur-xl"
            style={{ boxShadow: `0 0 34px ${STATUS_HEX[selectedStatus]}22` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="font-brand text-[14px] uppercase tracking-[0.22em]"
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

      {/* Base of the panel: one status line, then the four stage cards. */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 border-t border-brass/25 bg-[#0a070b]/92 px-3 pb-2.5 pt-1.5 backdrop-blur-xl">
        {showHelper ? (
          <ol
            data-ritual-helper
            className="mb-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 font-sans text-[12px] font-medium leading-snug text-bone"
          >
            {(mode === "2d" ? HELPER_STEPS_2D : HELPER_STEPS).map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="text-crimson" aria-hidden>
                    →
                  </span>
                )}
                <span>
                  <span className="text-crimson">{index + 1}.</span> {step}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[12px] uppercase tracking-[0.16em] text-bone/75">
            <span>SSE ↔ 3D sync</span>
            <span className={running ? "text-crimson" : summary ? (summary.unresolved > 0 ? "text-crimson" : "text-neon") : ""}>
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
        <div className="grid grid-cols-4 gap-1.5">
          {RITUAL_TIMELINE_STEPS.map((step) => {
            const status = nodes[step.stageId];
            const color = STATUS_HEX[status];
            const isSelected = selected === step.stageId;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setSelected(isSelected ? null : step.stageId)}
                aria-pressed={isSelected}
                aria-label={`${step.label}: ${CARD_STATUS[status]}`}
                data-stage-card={step.stageId}
                data-status={status}
                className="medieval-btn flex min-w-0 flex-col items-center justify-center gap-0.5 bg-[#140f13] px-1 py-1.5 transition hover:bg-[#1d151b]"
                style={
                  status === "pending"
                    ? undefined
                    : { boxShadow: `inset 0 0 0 1px ${color}${isSelected ? "" : "88"}, inset 0 0 14px ${color}33` }
                }
              >
                <span
                  className="max-w-full truncate font-brand text-[12px] font-bold uppercase leading-tight tracking-[0.04em]"
                  style={{ color: status === "pending" ? "#E2D9C8" : color }}
                >
                  {step.label}
                </span>
                <span className="max-w-full truncate font-sans text-[12px] font-semibold uppercase tracking-[0.08em] text-bone/70">
                  {CARD_STATUS[status]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
