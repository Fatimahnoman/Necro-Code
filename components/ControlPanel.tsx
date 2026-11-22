"use client";

import { motion } from "framer-motion";
import {
  ChevronDown,
  FileCode2,
  GitBranch,
  Loader2,
  RotateCcw,
  Skull,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type GitHubSummonResponse,
  parseGitHubFileUrl,
} from "@/lib/github";
import {
  findLanguage,
  languageIdFromFilename,
  RUNNER_LANGUAGES,
} from "@/lib/languages";
import { RITUAL_PRESETS } from "@/lib/presets";
import type { AgentPhase } from "@/lib/types";

interface ControlPanelProps {
  code: string;
  onCodeChange: (value: string) => void;
  directive: string;
  onDirectiveChange: (value: string) => void;
  filename: string;
  onFilenameChange: (name: string) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  onSelectPreset: (id: string) => void;
  selectedPresetId: string | null;
  onRun: () => void;
  onReset: () => void;
  running: boolean;
  phase: AgentPhase;
  progress: number;
}

/** Pressed wax seal stamped with a skull: the trigger's emblem. */
function WaxSigil() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden focusable="false" className="h-7 w-7 shrink-0 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.7))]">
      <path
        d="M14 1.5c2 0 2.6 1.6 4.3 2.1 1.8.5 3.4-.6 4.6.6 1.2 1.2.1 2.8.6 4.6.5 1.7 2.1 2.3 2.1 4.3s-1.6 2.6-2.1 4.3c-.5 1.8.6 3.4-.6 4.6-1.2 1.2-2.8.1-4.6.6-1.7.5-2.3 2.1-4.3 2.1s-2.6-1.6-4.3-2.1c-1.8-.5-3.4.6-4.6-.6-1.2-1.2-.1-2.8-.6-4.6C3.4 15.6 1.8 15 1.8 13s1.6-2.6 2.1-4.3c.5-1.8-.6-3.4.6-4.6 1.2-1.2 2.8-.1 4.6-.6C11.4 3.1 12 1.5 14 1.5Z"
        fill="#b0122e"
        stroke="#5a0614"
        strokeWidth="0.8"
      />
      <circle cx="14" cy="13.5" r="8" fill="none" stroke="#ff8a96" strokeOpacity="0.35" strokeWidth="0.8" />
      <path
        d="M14 8.2c-2.9 0-4.8 2-4.8 4.5 0 1.5.7 2.6 1.7 3.2v1.6h1.5v-1h1.2v1h1.5v-1.6c1-.6 1.7-1.7 1.7-3.2 0-2.5-1.9-4.5-4.8-4.5Zm-1.9 4.2a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm3.8 0a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z"
        fill="#3d030c"
        fillOpacity="0.85"
      />
      <ellipse cx="10" cy="7" rx="3" ry="1.4" fill="#ffd0d5" fillOpacity="0.35" transform="rotate(-30 10 7)" />
    </svg>
  );
}

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Dormant",
  thinking: "Channelling",
  tool_call: "Scanning",
  executing: "Exorcising",
  complete: "Purified",
};

export function ControlPanel({
  code,
  onCodeChange,
  directive,
  onDirectiveChange,
  filename,
  onFilenameChange,
  language,
  onLanguageChange,
  onSelectPreset,
  selectedPresetId,
  onRun,
  onReset,
  running,
  phase,
  progress,
}: ControlPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const githubInputRef = useRef<HTMLInputElement>(null);
  const githubAbortRef = useRef<AbortController | null>(null);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubStatus, setGithubStatus] = useState<{
    kind: "idle" | "loading" | "error" | "success";
    message: string;
  }>({ kind: "idle", message: "" });

  useEffect(() => {
    if (githubOpen) githubInputRef.current?.focus();
  }, [githubOpen]);

  const handleGithubSummon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (running || githubStatus.kind === "loading") return;

    const parsed = parseGitHubFileUrl(githubUrl);
    if (!parsed.ok) {
      setGithubStatus({ kind: "error", message: parsed.message });
      return;
    }

    githubAbortRef.current?.abort();
    const controller = new AbortController();
    githubAbortRef.current = controller;
    setGithubStatus({ kind: "loading", message: "Summoning from GitHub…" });

    try {
      const response = await fetch("/api/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: githubUrl }),
        signal: controller.signal,
      });
      const data = (await response.json()) as GitHubSummonResponse;
      if (!data.ok) {
        setGithubStatus({ kind: "error", message: data.message });
        return;
      }
      onCodeChange(data.code);
      onFilenameChange(data.path);
      if (data.language) onLanguageChange(data.language);
      setGithubStatus({
        kind: "success",
        message: `${data.owner}/${data.repo}@${data.ref} · ${data.lines} lines${
          data.language ? ` · ${findLanguage(data.language).label}` : " · unknown extension, runtime unchanged"
        }`,
      });
    } catch {
      if (controller.signal.aborted) return;
      setGithubStatus({ kind: "error", message: "Could not reach the GitHub summoner." });
    }
  };

  const lines = useMemo(() => code.split("\n"), [code]);
  const languageMeta = findLanguage(language);
  const selectedPreset = RITUAL_PRESETS.find(
    (preset) => preset.id === selectedPresetId,
  );
  const SelectedIcon = selectedPreset?.icon ?? FileCode2;

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onCodeChange(reader.result);
        onFilenameChange(file.name);
        const detected = languageIdFromFilename(file.name);
        if (detected) onLanguageChange(detected);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <aside className="rune-border horror-panel relative flex h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-2xl p-4">
      <header className="flex shrink-0 items-center gap-3 border-b border-gold/10 pb-3">
        <div className="grid h-10 w-10 shrink-0 rotate-45 place-items-center rounded-md border border-gold/40 bg-[linear-gradient(135deg,rgba(255,0,60,0.25),rgba(157,78,221,0.15))] shadow-[0_0_22px_rgba(255,0,60,0.25),inset_0_0_10px_rgba(0,0,0,0.6)]">
          <Skull className="h-4.5 w-4.5 -rotate-45 text-gold" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="font-brand text-[15px] font-bold uppercase tracking-[0.14em] text-gold">
            Cursed Spellbook
          </h2>
          <p className="font-sans text-[12px] font-medium uppercase tracking-[0.18em] text-bone/70">
            Feed the pyre · write the curse
          </p>
        </div>
      </header>

      {/* Template selector */}
      <div className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="whitespace-nowrap font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-dim">
            Presets
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setGithubOpen((open) => !open)}
              aria-expanded={githubOpen}
              aria-controls="github-summon"
              title="Summon a file from a public GitHub repository"
              className={[
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap border-b px-1 font-display text-[12px] font-bold uppercase leading-none tracking-[0.1em] transition",
                githubOpen
                  ? "border-amethyst text-bone [text-shadow:0_0_10px_rgba(157,78,221,0.8)]"
                  : "border-transparent text-bone/85 hover:border-amethyst/60 hover:text-bone",
              ].join(" ")}
            >
              <GitBranch className="h-4 w-4 shrink-0 text-amethyst-glow" aria-hidden />
              GitHub
            </button>
            <span aria-hidden className="h-4 w-px bg-gold/20" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Upload a cursed artifact in any supported language"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap border-b px-1 font-display text-[12px] font-bold uppercase leading-none tracking-[0.1em] transition border-transparent text-bone/85 hover:border-gold/60 hover:text-bone"
            >
              <Upload className="h-4 w-4 shrink-0 text-gold" aria-hidden />
              Upload
            </button>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept={`${RUNNER_LANGUAGES.map(
              (item) => `.${item.extension}`,
            ).join(",")},.jsx,.mjs,.cjs,.mts,.cts,.txt`}
            onChange={handleUpload}
            className="hidden"
          />
        </div>

        {githubOpen && (
          <form
            id="github-summon"
            onSubmit={handleGithubSummon}
            className="space-y-1"
          >
            <div className="flex items-center gap-1.5">
              <input
                ref={githubInputRef}
                type="text"
                inputMode="url"
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
                placeholder="Paste public GitHub file URL..."
                aria-label="Public GitHub file URL"
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 font-mono text-[13px] text-bone outline-none transition placeholder:text-zinc-500 focus:border-haunt/50"
              />
              <button
                type="submit"
                disabled={running || githubStatus.kind === "loading" || githubUrl.trim().length === 0}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-haunt/40 bg-haunt/10 px-2.5 py-1.5 font-mono text-[13px] uppercase tracking-[0.16em] text-haunt-glow transition hover:bg-haunt/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {githubStatus.kind === "loading" && (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                )}
                Fetch
              </button>
            </div>
            {githubStatus.kind !== "idle" && (
              <p
                role={githubStatus.kind === "error" ? "alert" : "status"}
                className={`truncate font-mono text-[12px] ${
                  githubStatus.kind === "error"
                    ? "text-crimson"
                    : githubStatus.kind === "success"
                      ? "text-neon"
                      : "text-zinc-300"
                }`}
                title={githubStatus.message}
              >
                {githubStatus.message}
              </p>
            )}
          </form>
        )}

        <div className="relative flex items-center gap-2">
          <span className="grid h-8 w-6 shrink-0 place-items-center">
            <SelectedIcon
              className="h-4 w-4 text-amethyst-glow"
              aria-hidden
            />
          </span>
          <div className="relative min-w-0 flex-1">
            <select
              value={selectedPresetId ?? "custom"}
              onChange={(event) => {
                if (event.target.value !== "custom") {
                  onSelectPreset(event.target.value);
                }
              }}
              aria-label="Cursed preset"
              className="h-8 w-full appearance-none border-0 border-b border-gold/25 bg-transparent pl-1 pr-7 font-display text-[13px] font-bold uppercase tracking-[0.08em] text-bone outline-none transition [color-scheme:dark] hover:border-gold/50 focus:border-amethyst"
            >
              <option value="custom" disabled className="bg-crypt text-bone">
                Custom relic
              </option>
              {RITUAL_PRESETS.map((preset) => (
                <option
                  key={preset.id}
                  value={preset.id}
                  className="bg-crypt text-bone"
                >
                  {preset.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-300"
              aria-hidden
            />
          </div>
        </div>

        <p className="min-h-[2.2em] font-mono text-[13px] leading-relaxed text-zinc-300">
          {selectedPreset?.blurb ??
            "A custom curse, written by your own hand. The crypt reads every line."}
        </p>
      </div>

      {/* Optional ritual directive */}
      <div className="shrink-0 space-y-1">
        <label
          htmlFor="ritual-directive"
          className="flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-dim"
        >
          <Wand2 className="h-3.5 w-3.5 text-amethyst-glow" aria-hidden />
          Ritual Directive
          <span className="tracking-[0.16em] text-zinc-300">(optional)</span>
        </label>
        <input
          id="ritual-directive"
          type="text"
          value={directive}
          onChange={(event) => onDirectiveChange(event.target.value)}
          maxLength={320}
          placeholder="e.g., Fix infinite loops, convert to strict TypeScript, optimize performance..."
          className="w-full rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 font-mono text-[13px] text-bone outline-none transition placeholder:text-zinc-500 focus:border-spectral/50 focus:shadow-[0_0_16px_rgba(6,182,212,0.07)]"
        />
      </div>

      {/* Editor */}
      {/*
        No min-h-0 here: the block keeps its min-content height (toolbar +
        220px editor + counter ≈ 270px), so the counter can never be squeezed
        under the ritual controls; the panel scrolls instead.
      */}
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-dim">
            <Sparkles className="h-3.5 w-3.5 text-crimson" aria-hidden />
            Artifact
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[13px] text-zinc-100">
              {filename}
            </span>
            <span className="relative shrink-0">
              <select
                value={language}
                onChange={(event) => onLanguageChange(event.target.value)}
                aria-label="Sandbox language"
                title={`Sandbox language: ${languageMeta.label}`}
                className="w-[82px] appearance-none rounded border border-haunt/50 bg-black/80 py-0.5 pl-1.5 pr-4 font-mono text-[13px] uppercase tracking-[0.08em] text-haunt-glow outline-none transition [color-scheme:dark] hover:border-haunt/70 focus:border-haunt-glow"
              >
                {RUNNER_LANGUAGES.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    className="bg-crypt text-bone"
                  >
                    {item.short}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-haunt-glow/80"
                aria-hidden
              />
            </span>
          </span>
        </div>

        {/*
          Obsidian editor with a rune-divided line gutter. Lines do not wrap
          (horizontal scroll instead) so gutter numbers stay aligned; the
          gutter mirrors the textarea's vertical scroll.
        */}
        <div className="grimoire-editor flex min-h-[220px] w-full flex-1 overflow-hidden rounded-lg transition focus-within:shadow-[inset_0_0_0_1px_rgba(157,78,221,0.55),0_0_18px_rgba(157,78,221,0.15)]">
          <div
            ref={gutterRef}
            aria-hidden
            className="w-12 shrink-0 select-none overflow-hidden border-r-[3px] border-double border-gold/30 bg-black/25 pb-8 pr-2 pt-3 text-right font-display text-[12px] font-semibold leading-[20px] text-gold-dim/80 tabular-nums"
          >
            {lines.map((_, index) => (
              <div
                key={index}
                className={
                  (index + 1) % 10 === 0 ? "text-crimson/80" : undefined
                }
              >
                {(index + 1) % 10 === 0 ? `ᛟ${index + 1}` : index + 1}
              </div>
            ))}
          </div>
          <textarea
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            onScroll={(event) => {
              if (gutterRef.current) {
                gutterRef.current.scrollTop = event.currentTarget.scrollTop;
              }
            }}
            rows={8}
            wrap="off"
            spellCheck={false}
            aria-label="Cursed code artifact"
            placeholder="// Paste a cursed artifact in any supported language…"
            className="h-full min-h-[220px] w-full min-w-0 flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 font-mono text-[13px] leading-[20px] text-bone caret-crimson outline-none placeholder:text-zinc-500"
          />
        </div>

        <div
          className="flex min-h-[20px] shrink-0 items-center justify-between gap-3 font-sans text-[12px] font-medium uppercase leading-5 tracking-[0.1em] text-bone/85 tabular-nums"
          aria-live="off"
        >
          <span className="whitespace-nowrap">
            {lines.length.toLocaleString("en-US")} {lines.length === 1 ? "line" : "lines"}
          </span>
          <span className="whitespace-nowrap">
            {code.length.toLocaleString("en-US")} chars
          </span>
        </div>
      </div>

      {/* Ritual controls */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-gold/10 pt-2.5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between font-display text-[12px] font-semibold uppercase leading-5 tracking-[0.16em] text-bone tabular-nums">
            <span>{PHASE_LABEL[phase]}</span>
            <span className={`font-mono ${running ? "text-crimson" : "text-bone"}`}>
              {progress}%
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-crimson via-haunt to-neon"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: "easeOut", duration: 0.35 }}
            />
          </div>
        </div>

        <motion.button
          type="button"
          onClick={onRun}
          disabled={running}
          whileHover={running ? undefined : { scale: 1.012 }}
          whileTap={running ? undefined : { scale: 0.985 }}
          className="ritual-trigger flex h-12 min-h-[48px] w-full shrink-0 items-center justify-center rounded-xl px-4 font-brand text-[16px] font-bold uppercase tracking-[0.14em] text-bone shadow-[0_0_36px_rgba(255,0,60,0.4),0_0_60px_rgba(157,78,221,0.18)] transition-shadow [text-shadow:0_0_12px_rgba(255,0,60,0.8)] hover:shadow-[0_0_52px_rgba(255,0,60,0.55),0_0_80px_rgba(157,78,221,0.25)] disabled:cursor-not-allowed disabled:opacity-80"
        >
          <span className="flex items-center justify-center gap-2.5">
            {running ? (
              <Loader2 className="h-5 w-5 animate-spin text-bone" aria-hidden />
            ) : (
              <WaxSigil />
            )}
            {running ? "Exorcising…" : "Exorcise Code"}
            <span className="font-mono text-[12px] tracking-[0.12em] text-bone/70 [text-shadow:none]">
              {running ? `${progress}%` : "SSE"}
            </span>
          </span>
        </motion.button>

        <button
          type="button"
          onClick={onReset}
          disabled={running}
          className="flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gold/10 bg-black/25 px-3 font-sans text-[12px] font-semibold uppercase tracking-[0.18em] text-bone/75 transition hover:border-amethyst/45 hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Banish ritual
        </button>
      </div>
    </aside>
  );
}
