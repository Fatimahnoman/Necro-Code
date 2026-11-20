import type { AgentPhase, ExorcismSummary } from "@/lib/types";

/**
 * The 3D relic's emotional state. Every SSE stage event ultimately folds into
 * one of these four auras, which drives the WebGL emissive colours.
 */
export type AuraState = "idle" | "crimson" | "purple" | "green";

export const AURA_HEX: Record<AuraState, string> = {
  idle: "#7C3AED",
  crimson: "#FF003C",
  purple: "#A855F7",
  green: "#00FF66",
};

export const AURA_LABEL: Record<AuraState, string> = {
  idle: "DORMANT",
  crimson: "CORRUPTION",
  purple: "CHANNELLING",
  green: "PURIFIED",
};

export function auraFromState(
  phase: AgentPhase,
  bugCount: number,
  summary: ExorcismSummary | null,
): AuraState {
  if (phase === "complete") {
    return (summary?.unresolved ?? 0) > 0 ? "crimson" : "green";
  }
  if (phase === "idle") return "idle";
  if (bugCount > 0) return "crimson";
  return "purple";
}
