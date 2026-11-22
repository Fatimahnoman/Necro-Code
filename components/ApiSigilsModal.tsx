"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  API_SIGIL_META,
  type ApiSigilProvider,
  type ApiSigils,
  EMPTY_API_SIGILS,
  hasLiveSigils,
  normalizeApiSigils,
} from "@/lib/apiSigils";

interface ApiSigilsModalProps {
  open: boolean;
  sigils: ApiSigils;
  onClose: () => void;
  onSave: (sigils: ApiSigils) => void;
  onClear: () => void;
}

export function ApiSigilsModal({
  open,
  sigils,
  onClose,
  onSave,
  onClear,
}: ApiSigilsModalProps) {
  const [draft, setDraft] = useState<ApiSigils>(sigils);
  const [revealed, setRevealed] = useState<Record<ApiSigilProvider, boolean>>({
    gemini: false,
    groq: false,
    openrouter: false,
  });

  useEffect(() => {
    if (!open) return;
    setDraft(sigils);
    setRevealed({ gemini: false, groq: false, openrouter: false });
  }, [open, sigils]);

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

  const live = hasLiveSigils(draft);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(normalizeApiSigils(draft));
    onClose();
  };

  const update = (provider: ApiSigilProvider, value: string) => {
    setDraft((prev) => ({ ...prev, [provider]: value }));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-sigils-title"
            data-api-sigils
            onClick={(event) => event.stopPropagation()}
            className="rune-border horror-panel relative my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-haunt/25 bg-[#070910]/95 shadow-[0_0_70px_rgba(147,51,234,0.22)]"
          >
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-haunt/70 to-transparent" />

            <header className="flex items-start gap-3 border-b border-white/5 px-4 py-3.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-spectral/35 bg-spectral/10 shadow-[0_0_22px_rgba(6,182,212,0.18)]">
                <KeyRound className="h-4 w-4 text-spectral" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="api-sigils-title"
                  className="font-brand text-sm font-semibold uppercase tracking-[0.26em] text-bone"
                >
                  API Sigils
                </h2>
                <p className="mt-0.5 font-mono text-[13px] uppercase tracking-[0.2em] text-slate-400">
                  Bring your own keys · live heavy mode
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close API sigils"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:border-crimson/40 hover:text-crimson"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="space-y-3 p-4">
              <div
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
                  live
                    ? "border-neon/35 bg-neon/5 text-neon"
                    : "border-white/10 bg-black/40 text-slate-400"
                }`}
              >
                {live ? (
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.2em]">
                    {live ? "LIVE AI ENGINE" : "BUILTIN SAFETY NET"}
                  </p>
                  <p className="mt-1 font-mono text-[13px] leading-relaxed text-slate-400">
                    {live
                      ? "Your next exorcism will try Gemini → Groq → OpenRouter, then fall back to the deterministic crypt."
                      : "No key configured. The deterministic analyzer will fix known curses without any network call."}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {API_SIGIL_META.map((provider) => {
                  const value = draft[provider.id];
                  const active = value.trim().length > 0;
                  const isRevealed = revealed[provider.id];

                  return (
                    <label key={provider.id} className="block">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[13px] uppercase tracking-[0.22em] text-slate-400">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              active
                                ? "bg-neon shadow-[0_0_7px_rgba(0,255,102,0.9)]"
                                : "bg-slate-700"
                            }`}
                          />
                          {provider.label}
                        </span>
                        <span className="truncate font-mono text-[12px] uppercase tracking-[0.16em] text-slate-400">
                          {provider.hint}
                        </span>
                      </span>
                      <span className="relative mt-1 block">
                        <input
                          type={isRevealed ? "text" : "password"}
                          value={value}
                          onChange={(event) =>
                            update(provider.id, event.target.value)
                          }
                          placeholder={provider.placeholder}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          className="w-full rounded-lg border border-white/10 bg-black/65 py-2 pl-2.5 pr-10 font-mono text-[13px] tracking-[0.06em] text-bone outline-none transition placeholder:text-slate-700 focus:border-spectral/50 focus:shadow-[0_0_18px_rgba(6,182,212,0.08)]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRevealed((prev) => ({
                              ...prev,
                              [provider.id]: !prev[provider.id],
                            }))
                          }
                          aria-label={`${isRevealed ? "Hide" : "Show"} ${provider.label} key`}
                          className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-slate-400 transition hover:bg-white/5 hover:text-spectral"
                        >
                          {isRevealed ? (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      </span>
                      <span className="mt-1 block font-mono text-[12px] uppercase tracking-[0.14em] text-slate-400">
                        model · {provider.model}
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="rounded-lg border border-white/5 bg-black/30 px-2.5 py-2 font-mono text-[13px] leading-relaxed text-slate-400">
                Keys are stored only in this browser&apos;s localStorage and
                sent as request headers to this app&apos;s own SSE route. They
                are never written to the terminal, report, or history.
              </p>

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(EMPTY_API_SIGILS);
                    onClear();
                  }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-crimson/25 bg-crimson/5 px-2.5 font-mono text-[13px] uppercase tracking-[0.16em] text-crimson/80 transition hover:bg-crimson/10 hover:text-crimson"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  Clear all
                </button>
                <button
                  type="submit"
                  className="ml-auto inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-neon/40 bg-neon/10 px-3 font-mono text-[13px] uppercase tracking-[0.18em] text-neon transition hover:bg-neon/15 hover:shadow-[0_0_24px_rgba(0,255,102,0.18)] sm:flex-none"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  Seal sigils
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
