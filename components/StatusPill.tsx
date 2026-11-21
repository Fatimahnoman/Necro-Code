"use client";

import { motion } from "framer-motion";
import type { AgentPhase } from "@/lib/types";

const PHASE_META: Record<
  AgentPhase,
  { label: string; dot: string; text: string; ring: string }
> = {
  idle: {
    label: "Dormant",
    dot: "bg-zinc-500",
    text: "text-zinc-200",
    ring: "border-white/15",
  },
  thinking: {
    label: "Channelling",
    dot: "bg-haunt",
    text: "text-haunt",
    ring: "border-haunt/40",
  },
  tool_call: {
    label: "Scanning",
    dot: "bg-spectral",
    text: "text-spectral",
    ring: "border-spectral/40",
  },
  executing: {
    label: "Exorcising",
    dot: "bg-crimson",
    text: "text-crimson",
    ring: "border-crimson/40",
  },
  complete: {
    label: "Purified",
    dot: "bg-neon",
    text: "text-neon",
    ring: "border-neon/40",
  },
};

export function StatusPill({ phase }: { phase: AgentPhase }) {
  const meta = PHASE_META[phase];
  const animated = phase !== "idle" && phase !== "complete";

  return (
    <div
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border bg-black/50 px-2.5 font-mono text-[12px] font-medium uppercase leading-none tracking-[0.14em] backdrop-blur-md ${meta.ring} ${meta.text}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {animated && (
          <motion.span
            className={`absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-70`}
            animate={{ scale: [1, 2.6, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className={`relative inline-flex h-1.5 w-1.5 rounded-full ${meta.dot}`}
        />
      </span>
      {meta.label}
    </div>
  );
}
