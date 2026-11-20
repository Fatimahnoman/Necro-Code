import type { AgentEvent } from "@/lib/types";
import type { CyberSfx } from "@/lib/useCyberSound";

/** Map a streamed event to one synthesized haunted sound (or silence). */
export function sfxForEvent(event: AgentEvent): CyberSfx | null {
  if (event.phase === "complete") return "complete";
  if (event.level === "error" || event.nodeStatus === "error") return "error";

  if (event.nodeStatus === "active") {
    if (event.stage === "glitch_scanner") return "scan";
    if (event.stage === "exorcism_reasoning") return "fix";
    if (event.phase === "tool_call") return "tool";
    return "node";
  }

  if (event.nodeStatus === "done") return "success";
  return null;
}
