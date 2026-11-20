"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Clock3,
  History,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect } from "react";
import type { GrimoireHistoryEntry } from "@/lib/history";

interface HistoryDrawerProps {
  open: boolean;
  entries: GrimoireHistoryEntry[];
  onClose: () => void;
  onRestore: (entry: GrimoireHistoryEntry) => void;
  onClear: () => void;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown hour";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryDrawer({
  open,
  entries,
  onClose,
  onRestore,
  onClear,
}: HistoryDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="grimoire-history-title"
            data-history-drawer
            className="fixed right-0 top-0 z-[81] flex h-full w-full max-w-md flex-col overflow-x-hidden border-l border-haunt/25 bg-[#06080f]/95 shadow-[-24px_0_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-haunt/60 to-transparent" />

            <header className="flex shrink-0 items-start gap-3 border-b border-white/5 px-4 py-3.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-haunt/30 bg-haunt/10 shadow-[0_0_22px_rgba(147,51,234,0.18)]">
                <History className="h-4 w-4 text-haunt" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2
                    id="grimoire-history-title"
                    className="font-display text-sm font-semibold uppercase tracking-[0.26em] text-bone"
                  >
                    Grimoire History
                  </h2>
                  <span className="rounded border border-haunt/30 bg-haunt/10 px-1.5 py-0.5 font-mono text-[12px] text-haunt">
                    {entries.length}/10
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[13px] uppercase tracking-[0.2em] text-slate-400">
                  Last exorcisms sealed in this browser
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close grimoire history"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:border-crimson/40 hover:text-crimson"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-3">
              {entries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="relative grid h-16 w-16 place-items-center">
                    <span className="absolute inset-0 rounded-full border border-dashed border-haunt/25" />
                    <History className="h-5 w-5 text-haunt/45" aria-hidden />
                  </div>
                  <p className="font-mono text-[13px] uppercase tracking-[0.28em] text-slate-400">
                    The history is unwritten
                  </p>
                  <p className="max-w-[240px] font-mono text-[13px] leading-relaxed text-slate-400">
                    Every completed exorcism will leave a sealed memory here,
                    ready to be summoned back into the spellbook.
                  </p>
                </div>
              ) : (
                entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onRestore(entry)}
                    data-history-entry
                    className="group w-full rounded-xl border border-white/10 bg-black/35 p-2.5 text-left transition hover:border-haunt/35 hover:bg-haunt/5 hover:shadow-[0_0_24px_rgba(147,51,234,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-slate-400">
                        <Clock3 className="h-2.5 w-2.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {formatTimestamp(entry.createdAt)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.14em] ${
                          entry.engine.name === "Heuristic"
                            ? "border-white/10 bg-white/5 text-slate-400"
                            : "border-neon/30 bg-neon/10 text-neon"
                        }`}
                      >
                        {entry.engine.name}
                      </span>
                    </div>

                    <p className="mt-1.5 truncate font-mono text-[13px] text-bone/85">
                      {entry.preview || "Untitled artifact"}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[12px] uppercase tracking-[0.14em] text-slate-400">
                      {entry.filename}
                      {entry.directive ? " · directive sealed" : ""}
                    </p>

                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-2 font-mono text-[12px] uppercase tracking-[0.16em]">
                      <span className="flex items-center gap-2 text-slate-400">
                        <span className="text-crimson/80">
                          {entry.summary.detected} cursed
                        </span>
                        <span className="text-neon/80">
                          {entry.summary.fixed} fixed
                        </span>
                        {entry.summary.unresolved > 0 && (
                          <span className="text-haunt/80">
                            {entry.summary.unresolved} residual
                          </span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-haunt opacity-80 transition group-hover:opacity-100">
                        Restore
                        <ArrowUpRight className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/5 bg-black/35 px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-slate-400">
                <RotateCcw className="h-3 w-3" aria-hidden />
                One click restores code + result
              </span>
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-crimson/25 bg-crimson/5 px-2 font-mono text-[12px] uppercase tracking-[0.16em] text-crimson/80 transition hover:bg-crimson/10 hover:text-crimson"
                >
                  <Trash2 className="h-2.5 w-2.5" aria-hidden />
                  Clear all
                </button>
              )}
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
