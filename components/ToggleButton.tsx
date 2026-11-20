"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import type { NeonAccent } from "@/components/NeonButton";

interface ToggleButtonProps {
  label: string;
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
        "grid h-8 w-8 place-items-center rounded-full border transition-all duration-300",
        active
          ? `${style.on} ${style.text}`
          : "border-white/10 bg-black/35 text-slate-400 hover:border-white/20 hover:text-slate-300",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </motion.button>
  );
}
