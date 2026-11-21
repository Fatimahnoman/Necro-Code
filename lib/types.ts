/**
 * Shared contract for NecroCode — the Haunted AI Code Exorcist.
 * Imported by both the SSE route (server) and the HUD (client).
 */

export type AgentPhase =
  | "idle"
  | "thinking"
  | "tool_call"
  | "executing"
  | "complete";

/** The four haunted stages of the exorcism ritual. */
export type StageId =
  | "input_code"
  | "glitch_scanner"
  | "exorcism_reasoning"
  | "clean_code_output";

export type NodeStatus = "pending" | "active" | "done" | "error";

export type LogLevel = "info" | "success" | "warn" | "error" | "system" | "code";

export type BugSeverity = "critical" | "warning" | "info";

/** The active reasoning engine. The local analyzer is the deterministic fallback. */
export type AiEngineName = "Gemini" | "Groq" | "OpenRouter" | "Heuristic";

export interface EngineInfo {
  name: AiEngineName;
  model: string;
}

export const DEFAULT_ENGINE: EngineInfo = {
  name: "Heuristic",
  model: "NecroCode Static Exorcist",
};

/** One corruption discovered by the static exorcism engine. */
export interface BugFinding {
  id: string;
  title: string;
  severity: BugSeverity;
  line: number;
  column: number;
  message: string;
  hint: string;
  fixable: boolean;
  snippet: string;
}

/** A corruption that was actually neutralised by an automatic sigil. */
export interface AppliedFix {
  id: string;
  title: string;
  line: number;
  description: string;
}

export interface ExorcismSummary {
  detected: number;
  fixed: number;
  unresolved: number;
  lines: number;
  chars: number;
  critical: number;
  warning: number;
  info: number;
  /**
   * Code Health & Security Score (0–100) of the original artifact, from
   * `healthScore()` in `lib/report.ts`. Absent when the builtin analyzer does
   * not support the language, and on history entries saved before scoring.
   */
  healthBefore?: number;
  /** Same score for the purified artifact (residual findings only). */
  healthAfter?: number;
}

export interface ExorcismReport {
  original: string;
  fixed: string;
  findings: BugFinding[];
  appliedFixes: AppliedFix[];
  remaining: BugFinding[];
  summary: ExorcismSummary;
}

/** A single Server-Sent Event payload emitted by /api/agent/stream. */
export interface AgentEvent {
  seq: number;
  phase: AgentPhase;
  stage: StageId | null;
  nodeStatus: NodeStatus | null;
  level: LogLevel;
  message: string;
  progress: number;
  ts: string;
  /** Present when the event reports a detected corruption. */
  bug?: BugFinding;
  /** Present on the final event. */
  summary?: ExorcismSummary;
  /** The complete purified artifact (terminal may truncate the stream). */
  finalCode?: string;
  /** The exact normalized source that was exorcised (final event only). */
  originalCode?: string;
  /** Every detected corruption, including ones hidden by terminal truncation. */
  findings?: BugFinding[];
  /** Every automatic counter-sigil applied by the engine. */
  appliedFixes?: AppliedFix[];
  /** Engine that produced this exorcism. */
  engine?: EngineInfo;
}

export interface StageDef {
  id: StageId;
  label: string;
  description: string;
  glyph: string;
}

/** Canonical ordered ritual — single source of truth. */
export const WORKFLOW_STAGES: StageDef[] = [
  {
    id: "input_code",
    label: "Corrupted Code",
    description: "Bind the condemned snippet to the ritual circle.",
    glyph: "ᛟ",
  },
  {
    id: "glitch_scanner",
    label: "Spectral Scanner",
    description: "Hunt syntax corruption and logic parasites.",
    glyph: "ᚨ",
  },
  {
    id: "exorcism_reasoning",
    label: "Kiro Exorcism Reasoning",
    description: "Trace the curse and apply counter-sigils.",
    glyph: "ᚱ",
  },
  {
    id: "clean_code_output",
    label: "Purified Output",
    description: "Emit the cleansed, redeployable artifact.",
    glyph: "ᛉ",
  },
];
