"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Haunted Web Audio séance engine — no audio assets, only oscillators.
 * Each blip is panned across the stereo field so the dashboard feels like a
 * 3D space; detuned tones keep the ritual unsettling without being loud.
 */

export type CyberSfx =
  | "click"
  | "dhum"
  | "node"
  | "tool"
  | "scan"
  | "fix"
  | "success"
  | "complete"
  | "error"
  | "copy";

interface Blip {
  type: OscillatorType;
  freq: number;
  toFreq?: number;
  dur: number;
  gain: number;
}

const RECIPES: Record<CyberSfx, Blip[]> = {
  click: [{ type: "square", freq: 220, toFreq: 180, dur: 0.04, gain: 0.035 }],
  // The EXORCISE CODE impact: a short transient over a deep pitch-dropping
  // sub-bass slam, followed by a darker tail that blooms into the scan.
  dhum: [
    { type: "square", freq: 140, toFreq: 40, dur: 0.05, gain: 0.06 },
    { type: "sine", freq: 82, toFreq: 24, dur: 0.95, gain: 0.18 },
    { type: "triangle", freq: 54, toFreq: 20, dur: 1.15, gain: 0.1 },
  ],
  node: [{ type: "triangle", freq: 180, toFreq: 260, dur: 0.14, gain: 0.055 }],
  tool: [{ type: "sawtooth", freq: 160, toFreq: 220, dur: 0.12, gain: 0.045 }],
  scan: [
    { type: "square", freq: 90, toFreq: 150, dur: 0.16, gain: 0.035 },
    { type: "sawtooth", freq: 70, toFreq: 120, dur: 0.2, gain: 0.03 },
  ],
  fix: [
    { type: "sine", freq: 330, toFreq: 495, dur: 0.12, gain: 0.05 },
    { type: "triangle", freq: 495, dur: 0.1, gain: 0.035 },
  ],
  success: [
    { type: "sine", freq: 392, dur: 0.09, gain: 0.055 },
    { type: "sine", freq: 523.25, dur: 0.14, gain: 0.05 },
  ],
  complete: [
    { type: "sine", freq: 261.63, dur: 0.12, gain: 0.055 },
    { type: "sine", freq: 329.63, dur: 0.12, gain: 0.05 },
    { type: "sine", freq: 392, dur: 0.14, gain: 0.05 },
    { type: "triangle", freq: 523.25, dur: 0.24, gain: 0.055 },
  ],
  error: [
    { type: "sawtooth", freq: 130, toFreq: 55, dur: 0.28, gain: 0.065 },
  ],
  copy: [{ type: "square", freq: 740, toFreq: 990, dur: 0.06, gain: 0.035 }],
};

export function useCyberSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback(
    (sfx: CyberSfx) => {
      if (!enabled) return;
      const ctx = ensureCtx();
      if (!ctx) return;

      if (ctx.state === "suspended") void ctx.resume();

      const now = ctx.currentTime;
      let offset = 0;

      for (const blip of RECIPES[sfx]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = blip.type;
        osc.frequency.setValueAtTime(blip.freq, now + offset);
        if (blip.toFreq !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(1, blip.toFreq),
            now + offset + blip.dur,
          );
        }

        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(blip.gain, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + offset + blip.dur,
        );

        osc.connect(gain);

        // A tiny stereo pan makes the ritual feel physically present around
        // the listener. Safari supports StereoPanner in modern versions.
        if (typeof ctx.createStereoPanner === "function") {
          const panner = ctx.createStereoPanner();
          panner.pan.setValueAtTime((Math.random() * 1.2 - 0.6) * 0.55, now + offset);
          gain.connect(panner).connect(ctx.destination);
        } else {
          gain.connect(ctx.destination);
        }

        osc.start(now + offset);
        osc.stop(now + offset + blip.dur + 0.02);

        offset += blip.dur * 0.55;
      }
    },
    [enabled, ensureCtx],
  );

  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, []);

  return { play };
}
