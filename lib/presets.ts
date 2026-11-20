import type { LucideIcon } from "lucide-react";
import { Braces, Bug, Flame, Ghost, KeyRound, Moon, Timer } from "lucide-react";
import { CURSED_ARTIFACTS, type CursedArtifact } from "@/lib/cursedCode";

export type SpellAccent = "blood" | "haunt" | "spectral" | "ectoplasm";

export interface RitualPreset extends CursedArtifact {
  icon: LucideIcon;
  accent: SpellAccent;
}

const PRESET_META: Record<string, { icon: LucideIcon; accent: SpellAccent }> = {
  "haunted-loop": { icon: Flame, accent: "blood" },
  "phantom-fetch": { icon: Ghost, accent: "haunt" },
  "tainted-secret": { icon: KeyRound, accent: "blood" },
  "glitchy-react": { icon: Bug, accent: "spectral" },
  "nan-ritual": { icon: Moon, accent: "ectoplasm" },
  "memory-leak": { icon: Timer, accent: "spectral" },
  "syntax-corruption": { icon: Braces, accent: "blood" },
};

export const RITUAL_PRESETS: RitualPreset[] = CURSED_ARTIFACTS.map(
  (artifact) => {
    const meta = PRESET_META[artifact.id] ?? {
      icon: Ghost,
      accent: "haunt",
    };
    return { ...artifact, ...meta };
  },
);
