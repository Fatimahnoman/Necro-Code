"use client";

import { useCallback, useEffect, useRef } from "react";
import type { StageId } from "@/lib/types";

interface BatSwarmOverlayProps {
  running: boolean;
  activeStage: StageId | null;
}

/** Six different exits from the skull's mouth into the whole viewport. */
const FLIGHTS = [
  { dx: -0.42, dy: -0.36, bend: -0.2, delay: 0, scale: 1, rotate: -16 },
  { dx: 0.44, dy: -0.33, bend: 0.22, delay: 60, scale: 0.9, rotate: 14 },
  { dx: -0.46, dy: 0.3, bend: 0.18, delay: 110, scale: 0.86, rotate: -28 },
  { dx: 0.45, dy: 0.34, bend: -0.19, delay: 150, scale: 1.04, rotate: 24 },
  { dx: -0.06, dy: -0.5, bend: 0.26, delay: 200, scale: 0.82, rotate: 0 },
  { dx: 0.1, dy: 0.48, bend: -0.25, delay: 250, scale: 0.96, rotate: 8 },
] as const;

const FLIGHT_MS = 2200;
const COOLDOWN_MS = 2200;

/**
 * Page-wide continuation of the 3D swarm. The WebGL bats are clipped to the
 * altar canvas; these translucent, click-through silhouettes let the same
 * burst roam over the whole webpage without blocking the code/diff panels.
 */
export function BatSwarmOverlay({ running, activeStage }: BatSwarmOverlayProps) {
  const batRefs = useRef<Array<HTMLDivElement | null>>([]);
  const prevRunning = useRef(running);
  const prevStage = useRef(activeStage);
  const lastLaunch = useRef(-Infinity);

  const launch = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const now = Date.now();
    if (now - lastLaunch.current < COOLDOWN_MS) return;
    lastLaunch.current = now;

    const canvases = Array.from(
      document.querySelectorAll<HTMLElement>("[data-ritual-canvas]"),
    );
    const canvas = canvases.find((element) => element.getBoundingClientRect().width > 0);
    const rect = canvas?.getBoundingClientRect();
    const startX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const startY = rect ? rect.top + rect.height * 0.56 : window.innerHeight / 2;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    FLIGHTS.forEach((flight, index) => {
      const element = batRefs.current[index];
      if (!element) return;
      const endX = startX + flight.dx * viewportW;
      const endY = startY + flight.dy * viewportH;
      const midX = (startX + endX) / 2 - (endY - startY) * flight.bend;
      const midY = (startY + endY) / 2 + (endX - startX) * flight.bend;

      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [
          {
            transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.25) rotate(${flight.rotate}deg)`,
            opacity: 0,
          },
          {
            transform: `translate3d(${midX}px, ${midY}px, 0) scale(${flight.scale}) rotate(${flight.rotate + flight.bend * 180}deg)`,
            opacity: 0.7,
            offset: 0.45,
          },
          {
            transform: `translate3d(${endX}px, ${endY}px, 0) scale(${flight.scale * 1.1}) rotate(${flight.rotate + 200}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: FLIGHT_MS,
          delay: flight.delay,
          easing: "cubic-bezier(.22,.68,.3,1)",
          fill: "forwards",
        },
      );
    });
  }, []);

  useEffect(() => {
    const swarmStage =
      activeStage === "glitch_scanner" || activeStage === "exorcism_reasoning";
    const starting = running && !prevRunning.current;
    const entering = swarmStage && prevStage.current !== activeStage;
    prevRunning.current = running;
    prevStage.current = activeStage;
    if (starting || entering) launch();
  }, [running, activeStage, launch]);

  useEffect(() => () => {
    batRefs.current.forEach((element) =>
      element?.getAnimations().forEach((animation) => animation.cancel()),
    );
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <style>{`
        .bat-flight .bat-wing-left {
          transform-box: fill-box;
          transform-origin: 100% 35%;
          animation: bat-flap-left 0.24s ease-in-out infinite alternate;
        }
        .bat-flight .bat-wing-right {
          transform-box: fill-box;
          transform-origin: 0% 35%;
          animation: bat-flap-right 0.24s ease-in-out infinite alternate;
        }
        @keyframes bat-flap-left {
          from { transform: rotate(16deg) scaleY(1); }
          to { transform: rotate(-34deg) scaleY(0.72); }
        }
        @keyframes bat-flap-right {
          from { transform: rotate(-16deg) scaleY(1); }
          to { transform: rotate(34deg) scaleY(0.72); }
        }
      `}</style>
      {FLIGHTS.map((flight, index) => (
        <div
          key={index}
          ref={(element) => {
            batRefs.current[index] = element;
          }}
          className="bat-flight absolute left-0 top-0 -ml-[34px] -mt-[21px] h-[42px] w-[68px] opacity-0 will-change-transform"
        >
          <svg
            viewBox="0 0 68 42"
            className="h-full w-full drop-shadow-[0_0_6px_rgba(255,43,85,0.45)]"
          >
            <g fill="#1a0d22" stroke="#ff2b55" strokeWidth="1.4" strokeLinejoin="round">
              <g className="bat-wing-left">
                <path d="M33 18 C24 8 14 6 4 10 C10 14 8 18 3 22 C13 22 18 26 22 30 C25 25 29 23 33 22 Z" />
              </g>
              <g className="bat-wing-right">
                <path d="M35 18 C44 8 54 6 64 10 C58 14 60 18 65 22 C55 22 50 26 46 30 C43 25 39 23 35 22 Z" />
              </g>
              <path d="M31 16 L29 8 L34 13 L39 8 L37 16 C39 21 37 26 34 28 C31 26 29 21 31 16 Z" />
            </g>
          </svg>
        </div>
      ))}
    </div>
  );
}
