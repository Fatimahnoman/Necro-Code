"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import type { NeonAccent } from "@/components/NeonButton";

interface ToggleButtonProps {
  label: string;
  /** Visible text next to the icon (e.g. "CRT"); icon-only when omitted. */
  shortLabel?: string;
  icon: LucideIcon;
  active: boolean;
  onToggle: () => void;
  accent?: NeonAccent;
  title?: string;
}

const ACCENT: Record<NeonAccent, { on: string; text: string }> = {
  blood: {
    on: "border-blood/60 bg-blood/10 shadow-glow-blood",
    text: "text-blood",
  },
  haunt: {
    on: "border-haunt/60 bg-haunt/10 shadow-glow-haunt",
    text: "text-haunt",
  },
  spectral: {
    on: "border-spectral/60 bg-spectral/10 shadow-glow-spectral",
    text: "text-spectral",
  },
  ectoplasm: {
    on: "border-neon/60 bg-neon/10 shadow-[0_0_18px_rgba(0,255,102,0.3)]",
    text: "text-neon",
  },
};

export function ToggleButton({
  label,
  shortLabel,
  icon: Icon,
  active,
  onToggle,
  accent = "blood",
  title,
}: ToggleButtonProps) {
  const style = ACCENT[accent];

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.92 }}
      aria-pressed={active}
      aria-label={label}
      title={title ?? label}
      className={[
        "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-mono text-[11px] font-medium uppercase leading-none tracking-[0.14em] transition-all duration-300",
        shortLabel ? "px-2.5" : "w-7",
        active
          ? `${style.on} ${style.text}`
          : "border-white/15 bg-black/45 text-zinc-200 hover:border-white/30 hover:text-white",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {shortLabel && <span>{shortLabel}</span>}
    </motion.button>
  );
}
