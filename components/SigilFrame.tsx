import { type ReactNode, useId } from "react";

/**
 * One gothic corner: a double L-bracket, a filigree curl, a diamond rivet,
 * and a ruby rune dot. Drawn for the top-left corner; the others are mirrored.
 */
function Corner({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden
      focusable="false"
      className={`sigil-corner ${className}`}
    >
      <path d="M1 22V5.5A4.5 4.5 0 0 1 5.5 1H22" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 15V8.5A3.5 3.5 0 0 1 8.5 5H15" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.9" />
      <path
        d="M22 1c2.6 0 4 1.4 4 3.2 0 1.4-1 2.3-2.2 2.3-1 0-1.6-.7-1.6-1.5"
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <path
        d="M1 22c0 2.6 1.4 4 3.2 4 1.4 0 2.3-1 2.3-2.2 0-1-.7-1.6-1.5-1.6"
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <path d="M9 6.2 11 9 9 11.8 7 9Z" fill="currentColor" fillOpacity="0.85" />
      <circle cx="9" cy="9" r="0.9" fill="#E0115F" />
    </svg>
  );
}

/** Eight-petal rose window: alternating ruby / violet panes, gold leading. */
function RoseWindow() {
  const petals = Array.from({ length: 8 }, (_, index) => index);
  return (
    <svg
      viewBox="-16 -16 32 32"
      aria-hidden
      focusable="false"
      className="h-8 w-8 [filter:drop-shadow(0_0_6px_rgba(224,17,95,0.6))_drop-shadow(0_0_10px_rgba(123,44,191,0.45))]"
    >
      <circle r="15" fill="#0f0b10" stroke="#A89C82" strokeWidth="1.2" />
      {petals.map((index) => (
        <path
          key={index}
          d="M0 0 L-4.6 -11.5 A12.4 12.4 0 0 1 4.6 -11.5 Z"
          transform={`rotate(${index * 45})`}
          fill={index % 2 === 0 ? "#E0115F" : "#7B2CBF"}
          fillOpacity="0.78"
          stroke="#2a2118"
          strokeWidth="0.8"
        />
      ))}
      <circle r="12.4" fill="none" stroke="#A89C82" strokeWidth="0.7" strokeOpacity="0.8" />
      <circle r="3.6" fill="#00C86E" fillOpacity="0.85" stroke="#A89C82" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * Gothic pointed-arch crown over a panel: a stone gable shaped as an ogival
 * arch with a stained-glass (ruby → violet) rim, finials at the ends, and a
 * rose window at the apex. It sits above the panel in normal flow, so it
 * never covers panel content.
 */
function ArchCrown() {
  const id = useId().replace(/:/g, "");
  return (
    <div aria-hidden className="pointer-events-none relative h-7 shrink-0">
      <svg
        viewBox="0 0 200 28"
        preserveAspectRatio="none"
        focusable="false"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id={`${id}-glass`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#E0115F" />
            <stop offset="0.35" stopColor="#7B2CBF" />
            <stop offset="0.5" stopColor="#E2D9C8" />
            <stop offset="0.65" stopColor="#7B2CBF" />
            <stop offset="1" stopColor="#E0115F" />
          </linearGradient>
          <linearGradient id={`${id}-stone`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1b151b" />
            <stop offset="1" stopColor="#100c10" />
          </linearGradient>
        </defs>
        {/* Stone gable: two curves meeting at a point form the pointed arch. */}
        <path
          d="M0 28 V20 Q62 20 100 3 Q138 20 200 20 V28 Z"
          fill={`url(#${id}-stone)`}
        />
        <path
          d="M0 20 Q62 20 100 3 Q138 20 200 20"
          fill="none"
          stroke={`url(#${id}-glass)`}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M6 27 Q64 25 100 9 Q136 25 194 27"
          fill="none"
          stroke="#A89C82"
          strokeOpacity="0.35"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Finials. */}
      <span className="absolute bottom-1 left-1 h-3 w-1.5 bg-[linear-gradient(180deg,#E0115F,#3a0a1a)] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <span className="absolute bottom-1 right-1 h-3 w-1.5 bg-[linear-gradient(180deg,#7B2CBF,#1e0a2e)] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <div className="absolute left-1/2 top-[-6px] -translate-x-1/2">
        <RoseWindow />
      </div>
    </div>
  );
}

/**
 * Wraps a dashboard panel as a cathedral window: a pointed-arch crown on top
 * and filigree corners at the base. Decorations are overlays/in-flow strips
 * outside the panel's scroll area. The panel (second child) fills the frame.
 */
export function SigilFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col [&>*:nth-child(2)]:min-h-0 [&>*:nth-child(2)]:flex-1 [&>*:nth-child(2)]:rounded-t-none">
      <ArchCrown />
      {children}
      <div aria-hidden className="pointer-events-none absolute -inset-x-[3px] -bottom-[3px] top-6 z-40">
        <Corner className="bottom-0 left-0 -scale-y-100" />
        <Corner className="bottom-0 right-0 -scale-x-100 -scale-y-100" />
      </div>
    </div>
  );
}
