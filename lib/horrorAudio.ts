"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Horror BGM engine — loops the produced `/audio/horror-bgm.mp3` asset through
 * a real HTMLAudioElement. The soundtrack stays intentionally quiet while the
 * crypt is idle, then surges during an active exorcism.
 *
 * Browsers block audible autoplay until the first user gesture. The hook tries
 * immediately for browsers that allow it; if playback is rejected, one pointer,
 * key, or touch anywhere unlocks the track at the soft base volume. The SFX
 * engine in `useCyberSound` keeps its own AudioContext, so the header BGM and
 * 3D AUDIO FX toggles remain completely independent.
 */

const BASE_VOLUME = 0.22;
const SURGE_VOLUME = 0.85;
const FADE_OUT_MS = 700;
const SURGE_UP_MS = 800;
const SURGE_DOWN_MS = 1_600;
const VOLUME_STEP_MS = 30;
const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;
const UNLOCK_OPTIONS: AddEventListenerOptions = {
  passive: true,
  capture: true,
};

function targetVolume(enabled: boolean, surge: boolean): number {
  if (!enabled) return 0;
  return surge ? SURGE_VOLUME : BASE_VOLUME;
}

export function useHorrorAudio(
  audioRef: RefObject<HTMLAudioElement | null>,
  enabled: boolean,
  surge: boolean,
): void {
  const enabledRef = useRef(enabled);
  const surgeRef = useRef(surge);
  const lastEnabledRef = useRef(enabled);
  const lastSurgeRef = useRef(surge);
  const applyRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(false);
  const fadeTimerRef = useRef<number | null>(null);
  const fadeTokenRef = useRef(0);
  const unlockCleanupRef = useRef<(() => void) | null>(null);

  enabledRef.current = enabled;
  surgeRef.current = surge;

  useEffect(() => {
    mountedRef.current = true;

    const audioElement = audioRef.current;
    if (!audioElement) {
      return () => {
        mountedRef.current = false;
      };
    }

    const audio: HTMLAudioElement = audioElement;
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;

    // Each play() attempt gets a token so a late autoplay rejection can never
    // pause a newer, gesture-unlocked playback attempt.
    let playAttempt = 0;

    function clearFade(): void {
      fadeTokenRef.current += 1;
      if (fadeTimerRef.current !== null) {
        window.clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    }

    function rampTo(
      target: number,
      durationMs: number,
      onDone?: () => void,
    ): void {
      clearFade();

      const to = Math.max(0, Math.min(1, target));
      const from = audio.volume;

      if (durationMs <= 0 || Math.abs(to - from) < 0.001) {
        audio.volume = to;
        onDone?.();
        return;
      }

      const token = fadeTokenRef.current;
      const startedAt = performance.now();

      const tick = () => {
        if (token !== fadeTokenRef.current || !mountedRef.current) return;

        const progress = Math.min(
          1,
          (performance.now() - startedAt) / durationMs,
        );
        const eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        audio.volume = Math.max(
          0,
          Math.min(1, from + (to - from) * eased),
        );

        if (progress >= 1) {
          clearFade();
          onDone?.();
        }
      };

      fadeTimerRef.current = window.setInterval(tick, VOLUME_STEP_MS);
    }

    function removeUnlock(): void {
      for (const event of UNLOCK_EVENTS) {
        window.removeEventListener(event, unlock, UNLOCK_OPTIONS);
      }
      unlockCleanupRef.current = null;
    }

    function attachUnlock(): void {
      if (unlockCleanupRef.current) return;
      for (const event of UNLOCK_EVENTS) {
        window.addEventListener(event, unlock, UNLOCK_OPTIONS);
      }
      unlockCleanupRef.current = removeUnlock;
    }

    function fadeOutAndPause(): void {
      if (audio.paused) {
        clearFade();
        audio.volume = 0;
        return;
      }

      rampTo(0, FADE_OUT_MS, () => {
        if (!mountedRef.current || enabledRef.current) return;
        audio.pause();
        audio.volume = 0;
      });
    }

    function startPlayback(): void {
      if (!mountedRef.current || !enabledRef.current) return;

      const target = targetVolume(true, surgeRef.current);

      if (!audio.paused) {
        removeUnlock();
        rampTo(
          target,
          surgeRef.current ? SURGE_UP_MS : SURGE_DOWN_MS,
        );
        return;
      }

      // Start audible playback at the soft base volume (or the surge volume
      // when an exorcism is already running) instead of the element's default
      // full volume. Blocked autoplay is handled by the one-shot unlock path.
      clearFade();
      audio.volume = target;
      const attempt = ++playAttempt;

      void audio
        .play()
        .then(() => {
          if (!mountedRef.current || attempt !== playAttempt) return;
          removeUnlock();

          if (!enabledRef.current) {
            fadeOutAndPause();
            return;
          }

          const nextTarget = targetVolume(true, surgeRef.current);
          if (Math.abs(audio.volume - nextTarget) > 0.001) {
            rampTo(
              nextTarget,
              surgeRef.current ? SURGE_UP_MS : SURGE_DOWN_MS,
            );
          }
        })
        .catch(() => {
          if (!mountedRef.current || attempt !== playAttempt) return;
          clearFade();
          audio.pause();
          audio.volume = 0;
          if (enabledRef.current) attachUnlock();
        });
    }

    function applyPlaybackState(): void {
      if (!mountedRef.current) return;

      if (!enabledRef.current) {
        fadeOutAndPause();
        return;
      }

      startPlayback();
    }

    function unlock(): void {
      removeUnlock();
      if (!enabledRef.current) return;
      startPlayback();
    }

    applyRef.current = applyPlaybackState;

    if (enabledRef.current) {
      // Arm the one-shot gesture listeners before the autoplay attempt; a
      // successful play() removes them, while a blocked attempt leaves them in
      // place until the first interaction anywhere on the page.
      attachUnlock();
      startPlayback();
    }

    return () => {
      mountedRef.current = false;
      playAttempt += 1;
      applyRef.current = null;
      removeUnlock();
      clearFade();
      audio.pause();
      audio.volume = 0;
    };
  }, [audioRef]);

  useEffect(() => {
    // The mount effect already attempted the initial playback state.
    if (
      lastEnabledRef.current === enabled &&
      lastSurgeRef.current === surge
    ) {
      return;
    }

    lastEnabledRef.current = enabled;
    lastSurgeRef.current = surge;
    applyRef.current?.();
  }, [enabled, surge]);
}
