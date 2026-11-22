"use client";

import { useCallback, useState } from "react";

export interface UiSettings {
  /** 3D AUDIO FX: interactive Web Audio execution sounds. */
  soundOn: boolean;
  /** HORROR BGM: looped adaptive horror soundtrack. */
  bgmOn: boolean;
  scanlinesOn: boolean;
  fogOn: boolean;
  /** Ritual stage renderer. 3D is downgraded to 2D automatically when needed. */
  graphMode: "3d" | "2d";
}

const DEFAULTS: UiSettings = {
  soundOn: false,
  bgmOn: true,
  scanlinesOn: true,
  fogOn: true,
  graphMode: "3d",
};

export function useUiSettings() {
  const [settings, setSettings] = useState<UiSettings>(DEFAULTS);

  const toggle = useCallback((key: keyof UiSettings) => {
    setSettings((prev) => {
      if (key === "graphMode") {
        return { ...prev, graphMode: prev.graphMode === "3d" ? "2d" : "3d" };
      }
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  return { settings, toggle };
}
