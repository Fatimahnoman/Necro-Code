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
      <circle cx="9" cy="9" r="0.9" fill="#FF003C" />
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
      className="h-8 w-8 [filter:drop-shadow(0_0_6px_rgba(255,0,60,0.65))_drop-shadow(0_0_10px_rgba(74,21,75,0.8))]"
    >
      <circle r="15" fill="#0f0b10" stroke="#A89C82" strokeWidth="1.2" />
      {petals.map((index) => (
        <path
          key={index}
          d="M0 0 L-4.6 -11.5 A12.4 12.4 0 0 1 4.6 -11.5 Z"
          transform={`rotate(${index * 45})`}
          fill={index % 2 === 0 ? "#8B0000" : "#4A154B"}
          fillOpacity="0.78"
          stroke="#2a2118"
          strokeWidth="0.8"
        />
      ))}
      <circle r="12.4" fill="none" stroke="#A89C82" strokeWidth="0.7" strokeOpacity="0.8" />
      <circle r="3.6" fill="#00FF66" fillOpacity="0.85" stroke="#B08D57" strokeWidth="0.8" />
    </svg>
  );
}

/** Stained-glass pane colors across the arch window, left → right. */
const ARCH_PANES = ["#8B0000", "#4A154B", "#FF003C", "#00FF66", "#FF003C", "#4A154B", "#8B0000"];

/**
 * Gothic pointed-arch crown over a panel: a weathered stone gable (its edge
 * roughened by an feTurbulence + feDisplacementMap filter) framing a pointed
 * stained-glass window of translucent dried-blood / amethyst / emerald panes
 * with lead mullions, finials at both ends, and a rose window at the apex.
 * It sits above the panel in normal flow, so it never covers panel content.
 */
function ArchCrown() {
  const id = useId().replace(/:/g, "");
  const arch = "M14 36 V27 Q66 26 100 4 Q134 26 186 27 V36 Z";
  const windowPath = "M30 36 V30 Q70 29 100 10 Q130 29 170 30 V36 Z";
  return (
    <div aria-hidden className="pointer-events-none relative h-9 shrink-0">
      <svg
        viewBox="0 0 200 36"
        preserveAspectRatio="none"
        focusable="false"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <filter id={`${id}-weather`} x="-5%" y="-20%" width="110%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9 0.6" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <linearGradient id={`${id}-rim`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#8B0000" />
            <stop offset="0.3" stopColor="#FF003C" />
            <stop offset="0.5" stopColor="#D9B77E" />
            <stop offset="0.7" stopColor="#9D4EDD" />
            <stop offset="1" stopColor="#4A154B" />
          </linearGradient>
          <linearGradient id={`${id}-stone`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1a1218" />
            <stop offset="1" stopColor="#0b080c" />
          </linearGradient>
          <clipPath id={`${id}-window`}>
            <path d={windowPath} />
          </clipPath>
        </defs>

        {/* Weathered stone gable. */}
        <g filter={`url(#${id}-weather)`}>
          <path d={arch} fill={`url(#${id}-stone)`} />
          <path
            d={arch.replace(" V36 Z", "")}
            fill="none"
            stroke="#B08D57"
            strokeOpacity="0.55"
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* Stained-glass window inside the arch. */}
        <g clipPath={`url(#${id}-window)`}>
          {ARCH_PANES.map((color, index) => (
            <rect
              key={index}
              x={30 + (index * 140) / ARCH_PANES.length}
              y="0"
              width={140 / ARCH_PANES.length}
              height="36"
              fill={color}
              fillOpacity="0.38"
            />
          ))}
          {/* Lead mullions + transom. */}
          {ARCH_PANES.slice(1).map((_, index) => (
            <line
              key={index}
              x1={30 + ((index + 1) * 140) / ARCH_PANES.length}
              x2={30 + ((index + 1) * 140) / ARCH_PANES.length}
              y1="0"
              y2="36"
              stroke="#120c0a"
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line x1="0" x2="200" y1="31" y2="31" stroke="#120c0a" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </g>
        <path
          d={windowPath.replace(" V36 Z", "")}
          fill="none"
          stroke={`url(#${id}-rim)`}
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 3px rgba(255,0,60,0.8))" }}
        />
      </svg>
      {/* Finials. */}
      <span className="absolute bottom-1 left-1 h-4 w-2 bg-[linear-gradient(180deg,#FF003C,#3a0006)] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <span className="absolute bottom-1 right-1 h-4 w-2 bg-[linear-gradient(180deg,#9D4EDD,#1e0a2e)] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <div className="absolute left-1/2 top-[-8px] -translate-x-1/2">
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
      <div aria-hidden className="pointer-events-none absolute -inset-x-[3px] -bottom-[3px] top-8 z-40">
        <Corner className="bottom-0 left-0 -scale-y-100" />
        <Corner className="bottom-0 right-0 -scale-x-100 -scale-y-100" />
      </div>
    </div>
  );
}
