import type { ReactNode } from "react";

/**
 * One gothic corner: a double L-bracket, a filigree curl, a diamond rivet,
 * and a blood-red rune dot. Drawn for the top-left corner; the other three
 * are mirrored with CSS transforms.
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

/**
 * Wraps a dashboard panel in gothic sigil corners. The corners are an
 * overlay on a non-scrolling wrapper, so they stay put even when the panel
 * inside scrolls. The panel (first child) fills the frame.
 */
export function SigilFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col [&>*:first-child]:min-h-0 [&>*:first-child]:flex-1">
      {children}
      <div aria-hidden className="pointer-events-none absolute -inset-[3px] z-40">
        <Corner className="left-0 top-0" />
        <Corner className="right-0 top-0 -scale-x-100" />
        <Corner className="bottom-0 left-0 -scale-y-100" />
        <Corner className="bottom-0 right-0 -scale-x-100 -scale-y-100" />
      </div>
    </div>
  );
}
