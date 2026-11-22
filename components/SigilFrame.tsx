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

/**
 * Tall Gothic pointed-arch header carrying the panel title. A weathered stone
 * gable (feTurbulence + feDisplacementMap) with a double moulding, a glowing
 * stained-glass rim, two small lancet windows at the sides (kept clear of the
 * title), finials, and a rose window at the apex.
 */
function ArchHeader({ title, glass }: { title: string; glass: FrameGlass }) {
  const id = useId().replace(/:/g, "");
  const outer = "M4 60 V30 Q58 30 100 3 Q142 30 196 30 V60 Z";
  const moulding = "M12 60 V34 Q62 33 100 10 Q138 33 188 34 V60";
  const rim = GLASS_RIM[glass];
  const lancet = (x: number) => `M${x - 5} 56 V44 Q${x - 5} 38 ${x} 35 Q${x + 5} 38 ${x + 5} 44 V56 Z`;
  return (
    <div className="relative h-[60px] shrink-0">
      <svg
        aria-hidden
        viewBox="0 0 200 60"
        preserveAspectRatio="none"
        focusable="false"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <filter id={`${id}-weather`} x="-5%" y="-20%" width="110%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9 0.6" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <linearGradient id={`${id}-rim`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={rim[0]} />
            <stop offset="0.5" stopColor="#D9B77E" />
            <stop offset="1" stopColor={rim[1]} />
          </linearGradient>
          <linearGradient id={`${id}-stone`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1d1419" />
            <stop offset="1" stopColor="#0d090c" />
          </linearGradient>
        </defs>
        <g filter={`url(#${id}-weather)`}>
          <path d={outer} fill={`url(#${id}-stone)`} />
          <path d={outer.replace(" V60 Z", "")} fill="none" stroke="#B08D57" strokeOpacity="0.6" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </g>
        <path
          className="candle-rim"
          d={moulding}
          fill="none"
          stroke={`url(#${id}-rim)`}
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
          style={{ filter: `drop-shadow(0 0 3px ${rim[0]})` }}
        />
        {[22, 178].map((x, index) => (
          <path key={x} d={lancet(x)} fill={rim[index]} fillOpacity="0.55" stroke="#B08D57" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <span aria-hidden className="pointer-events-none absolute bottom-1 left-1 h-4 w-2 bg-[linear-gradient(180deg,#FF003C,#3a0006)] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <span aria-hidden className="pointer-events-none absolute bottom-1 right-1 h-4 w-2 bg-[linear-gradient(180deg,#9D4EDD,#1e0a2e)] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-9px] -translate-x-1/2">
        <RoseWindow />
      </div>
      <h2 className="absolute inset-x-8 bottom-2 truncate text-center font-brand text-[15px] font-bold uppercase leading-none tracking-[0.12em] text-bone [text-shadow:0_0_14px_rgba(255,0,60,0.55),0_1px_0_rgba(0,0,0,0.9)]">
        <span className="cursed-glitch max-w-full truncate align-bottom">{title}</span>
      </h2>
    </div>
  );
}

export type FrameGlass = "crimson" | "violet" | "stone";

/** [left, right] stained-glass rim colors per frame. */
const GLASS_RIM: Record<FrameGlass, [string, string]> = {
  crimson: ["#FF003C", "#8B0000"],
  violet: ["#9D4EDD", "#4A154B"],
  stone: ["#8B0000", "#4A154B"],
};

/**
 * Wraps a dashboard panel as a cathedral window: a tall pointed-arch header
 * holding the panel title, stained-glass filigree strips down both sides
 * (`.glass-strip-crimson` / `.glass-strip-violet`, or carved stone for the
 * center), and filigree corners at the base. Decorations never cover panel
 * content; the panel (second child) fills the frame.
 */
export function SigilFrame({
  children,
  title,
  glass = "stone",
}: {
  children: ReactNode;
  title: string;
  glass?: FrameGlass;
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col [&>*:nth-child(2)]:min-h-0 [&>*:nth-child(2)]:flex-1 [&>*:nth-child(2)]:rounded-t-none">
      <ArchHeader title={title} glass={glass} />
      {children}
      <div aria-hidden className="pointer-events-none absolute -inset-x-[3px] -bottom-[3px] top-[52px] z-40">
        <span className={`glass-strip glass-strip-${glass} left-0`} />
        <span className={`glass-strip glass-strip-${glass} right-0`} />
        <Corner className="bottom-0 left-0 -scale-y-100" />
        <Corner className="bottom-0 right-0 -scale-x-100 -scale-y-100" />
      </div>
    </div>
  );
}
