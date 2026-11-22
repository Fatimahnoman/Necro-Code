"use client";

import {
  ChevronDown,
  Download,
  FileDiff,
  FileText,
  type LucideIcon,
  Share2,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export interface ExportMenuItem {
  id: string;
  label: string;
  /** Shown under the label, e.g. the downloaded filename. */
  hint: string;
  icon: LucideIcon;
  /** When set, the item is disabled and this text explains why. */
  disabledReason?: string;
  onSelect: () => void;
}

/**
 * `Export ▾` dropdown for the Grimoire toolbar. Uses the WAI-ARIA menu
 * pattern: arrow keys move focus, Escape and outside clicks close it, and
 * choosing an item closes the menu and returns focus to the trigger.
 */
export function ExportMenu({
  items,
  className,
  compact = false,
}: {
  items: ExportMenuItem[];
  className: string;
  /** Icon + chevron only (the label stays available to screen readers). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const enabled = items.some((item) => !item.disabledReason);

  // Focus the first enabled item only when the menu opens. `items` is rebuilt
  // on every parent render, so it must not be an effect dependency here.
  useEffect(() => {
    if (!open) return;
    const first = itemRefs.current.find((element) => element && !element.disabled);
    first?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Close if everything becomes disabled (e.g. a new ritual clears the artifact).
  useEffect(() => {
    if (open && !enabled) setOpen(false);
  }, [enabled, open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const focusable = itemRefs.current.filter(
      (element): element is HTMLButtonElement => !!element && !element.disabled,
    );
    if (focusable.length === 0) return;
    const current = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + focusable.length) % focusable.length;
    focusable[next].focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={!enabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Export"
        title={enabled ? "Export the report, git patch, or purified artifact" : "Nothing to export yet"}
        className={className}
      >
        <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {!compact && <span>Export</span>}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Export"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-white/15 bg-[#0a0b14]/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.7),0_0_26px_rgba(147,51,234,0.14)] backdrop-blur-xl"
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            const disabled = !!item.disabledReason;
            return (
              <button
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                disabled={disabled}
                title={item.disabledReason}
                onClick={() => {
                  item.onSelect();
                  close();
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.06] focus:bg-white/[0.08] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-haunt-glow" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-mono text-[13px] font-medium text-zinc-100">
                    {item.label}
                  </span>
                  <span className="block truncate font-mono text-[12px] text-zinc-400">
                    {item.disabledReason ?? item.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const EXPORT_ICONS = { report: FileText, patch: FileDiff, artifact: Download };
