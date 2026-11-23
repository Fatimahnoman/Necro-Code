"use client";

import {
  Box,
  ChevronDown,
  CloudFog,
  type LucideIcon,
  Layers3,
  Music,
  ScanLine,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { UiSettings } from "@/lib/useUiSettings";

type FxKey = keyof UiSettings;
type AtmosphereKey = Exclude<FxKey, "graphMode">;

const FX_ITEMS: Array<{
  key: AtmosphereKey;
  label: string;
  hint: string;
  icon: LucideIcon;
  on: string;
}> = [
  {
    key: "bgmOn",
    label: "Horror BGM",
    hint: "Looped soundtrack; surges during a ritual",
    icon: Music,
    on: "bg-blood",
  },
  {
    key: "soundOn",
    label: "3D Audio FX",
    hint: "Synthesized stage SFX and the DHUM! slam",
    icon: Volume2,
    on: "bg-haunt",
  },
  {
    key: "scanlinesOn",
    label: "CRT",
    hint: "Flickering scanline overlay",
    icon: ScanLine,
    on: "bg-spectral",
  },
  {
    key: "fogOn",
    label: "Fog",
    hint: "Drifting fog and the animated rune grid",
    icon: CloudFog,
    on: "bg-crimson",
  },
];

/**
 * Header popover that groups the four atmosphere toggles. Each row is a real
 * `role="switch"` button; the menu closes on outside click and Escape.
 */
export function FxMenu({
  settings,
  onToggle,
  className = "",
}: {
  settings: UiSettings;
  onToggle: (key: FxKey) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const activeCount = FX_ITEMS.filter((item) => settings[item.key]).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        title="Audio and atmosphere effects"
        className={className}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-haunt-glow" aria-hidden />
        <span className="hidden sm:inline">FX &amp; Audio</span>
        <span className="rounded border border-white/20 bg-black/50 px-1 py-px text-[12px] leading-none text-zinc-200">
          {activeCount}/{FX_ITEMS.length}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Audio and atmosphere effects"
          className="z-[100] absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/20 bg-[#0d0a14] p-1.5 shadow-2xl"
        >
          {FX_ITEMS.map((item) => {
            const active = settings[item.key];
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => onToggle(item.key)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-zinc-400"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] font-medium uppercase tracking-[0.08em] text-zinc-100">
                    {item.label}
                  </span>
                  <span className="block truncate font-mono text-[12px] text-zinc-400">
                    {item.hint}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`relative h-5 w-9 shrink-0 rounded-full border transition ${
                    active ? `${item.on} border-white/30` : "border-white/15 bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${
                      active ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
            );
          })}

          <div className="my-1 h-px bg-white/10" aria-hidden />

          <div className="flex items-center gap-3 rounded-lg px-2.5 py-2">
            {settings.graphMode === "3d" ? (
              <Box className="h-4 w-4 shrink-0 text-haunt-glow" aria-hidden />
            ) : (
              <Layers3 className="h-4 w-4 shrink-0 text-spectral" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="block font-mono text-[13px] font-medium uppercase tracking-[0.08em] text-zinc-100">
                Ritual Stage
              </p>
              <p className="block truncate font-mono text-[12px] text-zinc-400">
                2D fallback is automatic on low-end devices
              </p>
            </div>
            <div
              role="group"
              aria-label="Ritual stage renderer"
              className="flex shrink-0 rounded-md border border-white/15 bg-black/50 p-0.5"
            >
              {(["2d", "3d"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={settings.graphMode === mode}
                  onClick={() => {
                    if (settings.graphMode !== mode) onToggle("graphMode");
                  }}
                  className={`h-6 min-w-[34px] rounded px-1.5 font-sans text-[12px] font-bold uppercase leading-none tracking-[0.06em] transition ${
                    settings.graphMode === mode
                      ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
