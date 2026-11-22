"use client";

import { motion } from "framer-motion";
import {
  ChevronDown,
  FileCode2,
  GitBranch,
  Loader2,
  RotateCcw,
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
import { highlightCode, type TokenKind } from "@/lib/highlight";
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

/** Shared by the editor <pre> and <textarea> so glyphs line up exactly. */
const EDITOR_TEXT =
  "font-mono text-[13px] leading-[20px] [font-variant-ligatures:none] [tab-size:4]";

const TOKEN_CLASS: Record<Exclude<TokenKind, "plain">, string> = {
  keyword: "text-[#FF5C86]",
  string: "text-[#3EF29A]",
  comment: "text-gold-dim",
  number: "text-amber-300",
};

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
  const highlightRef = useRef<HTMLPreElement>(null);
  const [directiveOpen, setDirectiveOpen] = useState(false);

  // Reveal the directive slot whenever a directive is set (e.g. AUTO DEMO).
  useEffect(() => {
    if (directive.length > 0) setDirectiveOpen(true);
  }, [directive]);
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
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
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

  const toolButton =
    "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap border-b px-1.5 font-sans text-[12px] font-bold uppercase leading-none tracking-[0.08em] transition";

  return (
    <aside className="tome-panel relative flex h-full min-h-0 flex-col gap-2.5 overflow-x-hidden overflow-y-auto rounded-b-2xl py-3 pl-9 pr-4">
      {/* 1 · Preset / GitHub / Upload (+ directive) and filename + runtime. */}
      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <div
            className="brass-slot relative flex min-w-0 flex-1 items-center gap-1 pl-1.5"
            title={
              selectedPreset?.blurb ??
              "A custom curse, written by your own hand. The crypt reads every line."
            }
          >
            <SelectedIcon className="h-4 w-4 shrink-0 text-amethyst-glow" aria-hidden />
            <select
              value={selectedPresetId ?? "custom"}
              onChange={(event) => {
                if (event.target.value !== "custom") {
                  onSelectPreset(event.target.value);
                }
              }}
              aria-label="Cursed preset"
              className="h-8 w-full min-w-0 appearance-none border-0 bg-transparent pl-0.5 pr-6 font-sans text-[12px] font-bold uppercase tracking-[0.06em] text-bone outline-none [color-scheme:dark]"
            >
              <option value="custom" disabled className="bg-crypt text-bone">
                Custom relic
              </option>
              {RITUAL_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id} className="bg-crypt text-bone">
                  {preset.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bone/70"
              aria-hidden
            />
          </div>

          <span className="brass-slot flex shrink-0 items-center px-1">
            <button
              type="button"
              onClick={() => setGithubOpen((open) => !open)}
              aria-expanded={githubOpen}
              aria-controls="github-summon"
              title="Summon a file from a public GitHub repository"
              className={`${toolButton} ${
                githubOpen
                  ? "border-crimson text-bone [text-shadow:0_0_10px_rgba(255,0,60,0.8)]"
                  : "border-transparent text-bone/85 hover:border-brass-light/60 hover:text-bone"
              }`}
            >
              <GitBranch className="h-4 w-4 shrink-0 text-amethyst-glow" aria-hidden />
              GitHub
            </button>
            <span aria-hidden className="h-4 w-px bg-brass/50" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Upload a cursed artifact in any supported language"
              className={`${toolButton} border-transparent text-bone/85 hover:border-brass-light/60 hover:text-bone`}
            >
              <Upload className="h-4 w-4 shrink-0 text-brass-light" aria-hidden />
              Upload
            </button>
            <span aria-hidden className="h-4 w-px bg-brass/50" />
            <button
              type="button"
              onClick={() => setDirectiveOpen((open) => !open)}
              aria-expanded={directiveOpen}
              aria-controls="ritual-directive-slot"
              aria-label="Ritual directive"
              title="Optional ritual directive for the live engine"
              className={`${toolButton} relative ${
                directiveOpen
                  ? "border-crimson text-bone"
                  : "border-transparent text-bone/85 hover:border-brass-light/60 hover:text-bone"
              }`}
            >
              <Wand2 className="h-4 w-4 shrink-0 text-crimson" aria-hidden />
              {directive.length > 0 && (
                <span aria-hidden className="absolute right-0.5 top-1 h-1.5 w-1.5 rounded-full bg-crimson shadow-[0_0_6px_rgba(255,0,60,0.9)]" />
              )}
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
          <form id="github-summon" onSubmit={handleGithubSummon} className="space-y-1">
            <div className="brass-slot flex items-center gap-1 p-1">
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
                className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-[13px] text-bone outline-none placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={running || githubStatus.kind === "loading" || githubUrl.trim().length === 0}
                className="medieval-btn inline-flex h-7 shrink-0 items-center gap-1 bg-dried/40 px-2.5 font-sans text-[12px] font-bold uppercase tracking-[0.12em] text-bone transition hover:bg-dried/60 disabled:cursor-not-allowed disabled:opacity-50"
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

        {directiveOpen && (
          <div id="ritual-directive-slot">
            <label htmlFor="ritual-directive" className="sr-only">
              Ritual directive (optional)
            </label>
            <input
              id="ritual-directive"
              type="text"
              value={directive}
              onChange={(event) => onDirectiveChange(event.target.value)}
              maxLength={320}
              placeholder="Ritual directive (optional): convert to strict TypeScript…"
              className="brass-slot w-full px-2.5 py-1.5 font-mono text-[13px] text-bone outline-none placeholder:text-zinc-500"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-[13px] text-bone" title={filename}>
            {filename}
          </span>
          <span className="relative shrink-0">
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              aria-label="Sandbox language"
              title={`Sandbox language: ${languageMeta.label}`}
              className="h-7 w-[78px] appearance-none rounded border border-amethyst/50 bg-black/70 pl-1.5 pr-5 font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-amethyst-glow outline-none transition [color-scheme:dark] hover:border-amethyst focus:border-amethyst-glow"
            >
              {RUNNER_LANGUAGES.map((item) => (
                <option key={item.id} value={item.id} className="bg-crypt text-bone">
                  {item.short}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amethyst-glow/80"
              aria-hidden
            />
          </span>
        </div>
      </div>

      {/* 2 · LINES / CHARS, then phase + progress. */}
      <div className="shrink-0 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5" aria-live="off">
          {(
            [
              [lines.length, lines.length === 1 ? "Line" : "Lines"],
              [code.length, "Chars"],
            ] as const
          ).map(([value, label]) => (
            <div key={label} className="brass-slot flex items-baseline gap-1.5 px-2.5 py-1.5">
              <span className="font-mono text-[15px] font-bold leading-none text-crimson tabular-nums [text-shadow:0_0_8px_rgba(255,0,60,0.5)]">
                {value.toLocaleString("en-US")}
              </span>
              <span className="font-sans text-[12px] font-semibold uppercase tracking-[0.1em] text-bone/80">
                {label}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between font-sans text-[12px] font-bold uppercase leading-5 tracking-[0.12em] text-bone tabular-nums">
          <span>{PHASE_LABEL[phase]}</span>
          <span className={`font-mono ${running ? "text-crimson" : "text-bone"}`}>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5 shadow-[inset_0_0_0_1px_rgba(176,141,87,0.25)]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-dried via-crimson to-[#FF2BD6] shadow-[0_0_10px_rgba(255,0,60,0.6)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.35 }}
          />
        </div>
      </div>

      {/*
        3 · Tall syntax-highlighted editor. A highlighted <pre> sits behind a
        transparent <textarea> (same font, size, padding, line-height, tab
        size, no ligatures) and follows its scroll via a transform; the
        gutter follows the vertical scroll. Lines do not wrap.
      */}
      <div className="grimoire-editor flex min-h-[240px] w-full flex-1 overflow-hidden rounded-lg transition focus-within:shadow-[inset_0_0_0_1px_rgba(255,0,60,0.5),0_0_18px_rgba(255,0,60,0.15)]">
        <div
          ref={gutterRef}
          aria-hidden
          className="w-12 shrink-0 select-none overflow-hidden border-r-[3px] border-double border-brass/45 bg-black/30 pb-8 pr-2 pt-3 text-right font-mono text-[12px] font-medium leading-[20px] text-gold-dim/80 tabular-nums [background-image:repeating-linear-gradient(180deg,transparent_0_19px,rgba(176,141,87,0.12)_19px_20px)] [background-position:0_12px]"
        >
          {lines.map((_, index) => (
            <div key={index} className={(index + 1) % 10 === 0 ? "text-crimson/80" : undefined}>
              {(index + 1) % 10 === 0 ? `ᛟ${index + 1}` : index + 1}
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <pre
            ref={highlightRef}
            aria-hidden
            className={`pointer-events-none absolute left-0 top-0 m-0 whitespace-pre px-3 py-3 ${EDITOR_TEXT} text-bone will-change-transform`}
          >
            {tokens.map((token, index) =>
              token.kind === "plain" ? (
                token.text
              ) : (
                <span key={index} className={TOKEN_CLASS[token.kind]}>
                  {token.text}
                </span>
              ),
            )}
            {"\n"}
          </pre>
          <textarea
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            onScroll={(event) => {
              const { scrollTop, scrollLeft } = event.currentTarget;
              if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
              if (highlightRef.current) {
                highlightRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
              }
            }}
            rows={8}
            wrap="off"
            spellCheck={false}
            aria-label="Cursed code artifact"
            placeholder="// Paste a cursed artifact in any supported language…"
            className={`relative block h-full min-h-[240px] w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 ${EDITOR_TEXT} text-transparent caret-crimson outline-none selection:bg-crimson/35 placeholder:text-zinc-500`}
          />
        </div>
      </div>

      {/* 4 · Ritual triggers. */}
      <div className="flex shrink-0 flex-col gap-2 pt-1">
        <motion.button
          type="button"
          onClick={onRun}
          disabled={running}
          whileHover={running ? undefined : { scale: 1.012 }}
          whileTap={running ? undefined : { scale: 0.985 }}
          className="ritual-trigger flex h-[60px] min-h-[60px] w-full shrink-0 items-center justify-center rounded-xl px-4 font-brand text-[18px] font-bold uppercase tracking-[0.12em] text-bone shadow-[0_0_36px_rgba(255,0,60,0.4),0_0_60px_rgba(157,78,221,0.18)] transition-shadow [text-shadow:0_0_12px_rgba(255,0,60,0.8)] hover:shadow-[0_0_52px_rgba(255,0,60,0.55),0_0_80px_rgba(157,78,221,0.25)] disabled:cursor-not-allowed disabled:opacity-80"
        >
          <span className="flex items-center justify-center gap-3">
            {running ? (
              <Loader2 className="h-6 w-6 animate-spin text-bone" aria-hidden />
            ) : (
              <WaxSigil />
            )}
            <span className="flex flex-col items-center leading-none">
              {running ? "Exorcising…" : "Exorcise Code"}
              <span className="mt-1 rounded-full border border-bone/40 bg-black/40 px-2 py-0.5 font-mono text-[12px] font-bold tracking-[0.14em] text-bone/85 [text-shadow:none]">
                {running ? `${progress}%` : "SSE"}
              </span>
            </span>
          </span>
        </motion.button>

        <button
          type="button"
          onClick={onReset}
          disabled={running}
          className="medieval-btn mx-auto flex h-9 w-3/4 shrink-0 items-center justify-center gap-1.5 bg-[#140f13] px-3 font-sans text-[12px] font-bold uppercase tracking-[0.16em] text-bone/80 transition hover:text-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Banish ritual
        </button>
      </div>
    </aside>
  );
}
