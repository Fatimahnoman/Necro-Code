"use client";

import { useCallback, useState } from "react";

export interface UiSettings {
  /** 3D AUDIO FX: interactive Web Audio execution sounds. */
  soundOn: boolean;
  /** HORROR BGM: looped adaptive horror soundtrack. */
  bgmOn: boolean;
  scanlinesOn: boolean;
  fogOn: boolean;
}

const DEFAULTS: UiSettings = {
  soundOn: false,
  bgmOn: true,
  scanlinesOn: true,
  fogOn: true,
};

export function useUiSettings() {
  const [settings, setSettings] = useState<UiSettings>(DEFAULTS);

  const toggle = useCallback((key: keyof UiSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return { settings, toggle };
}
