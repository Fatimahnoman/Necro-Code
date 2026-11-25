"use client";

import { motion } from "framer-motion";
import {
  ChevronDown,
  FileCode2,
  GitBranch,
  Loader2,
  RotateCcw,
  Skull,
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
  detectCodeLanguage,
  DETECTION_MIN_SCORE,
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

const EDITOR_TEXT =
  "font-mono text-[13px] leading-[20px] [font-variant-ligatures:none] [tab-size:4]";

const TOKEN_CLASS: Record<Exclude<TokenKind, "plain">, string> = {
  keyword: "text-[#FF5C86]",
  string: "text-[#3EF29A]",
  comment: "text-[#A89C82]",
  number: "text-amber-300",
};

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Dormant",
  thinking: "Channelling",
  tool_call: "Scanning",
  executing: "Exorcising",
  purified: "Verifying",
  complete: "Purified",
};

/**
 * Unmistakable one-line fingerprints. The general `detectCodeLanguage`
 * heuristic needs a few signals; these let a single obvious paste (e.g.
 * `print("hi")`) switch the sandbox compiler immediately.
 */
const CLEAR_LANGUAGE_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bpublic\s+static\s+void\s+main\s*\(\s*String\b/, "java"],
  [/^\s*#include\s*<\s*(iostream|vector|string|map|set|algorithm|memory|bits\/stdc\+\+\.h)\s*>/m, "cpp"],
  [/^\s*#include\s*<\s*(stdio|stdlib|math|ctype|stdbool|stdint)\.h\s*>/m, "c"],
  [/^\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/m, "python"],
  [/^\s*print\s*\(/m, "python"],
  [/^\s*package\s+main\s*$/m, "go"],
  [/\bfn\s+main\s*\(\s*\)/, "rust"],
  [/^\s*(?:use\s+std::|let\s+mut\b)/m, "rust"],
];

/** Return a language id only when the artifact is unambiguously one runtime. */
function detectEditorLanguage(value: string): string | null {
  for (const [pattern, id] of CLEAR_LANGUAGE_HINTS) {
    if (pattern.test(value)) return id;
  }
  const detected = detectCodeLanguage(value);
  if (!detected || detected.score < DETECTION_MIN_SCORE) return null;
  // Avoid flip-flopping between two closely scored languages while typing.
  if (detected.runnerUp > 0 && detected.score - detected.runnerUp < 2) return null;
  return detected.id;
}

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
          data.language ? ` · ${findLanguage(data.language).label}` : ""
        }`,
      });
    } catch {
      if (controller.signal.aborted) return;
      setGithubStatus({ kind: "error", message: "Could not reach the GitHub summoner." });
    }
  };

  const handleEditorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    onCodeChange(value);
    const detected = detectEditorLanguage(value);
    if (detected && detected !== language) onLanguageChange(detected);
  };

  const lines = useMemo(() => code.split("\n"), [code]);
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  const languageMeta = findLanguage(language);
  const selectedPreset = RITUAL_PRESETS.find((preset) => preset.id === selectedPresetId);
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
    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-sans text-[12px] font-semibold uppercase tracking-[0.08em] transition";

  return (
    <aside className="glass-obsidian dock-sigil flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full border border-crimson/45 bg-crimson/10 shadow-[0_0_18px_rgba(255,0,60,0.2)]">
          <Skull className="h-4 w-4 text-crimson" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="font-brand text-[13px] font-bold uppercase tracking-[0.16em] text-[#EDE6D6]">Cursed Spellbook</p>
          <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-400">Left ritual dock</p>
        </div>
      </header>

      <div className="shrink-0 space-y-2 border-b border-white/10 px-4 pb-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[150px] flex-1">
            <SelectedIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amethyst-glow" aria-hidden />
            <select
              value={selectedPresetId ?? "custom"}
              onChange={(event) => {
                if (event.target.value !== "custom") onSelectPreset(event.target.value);
              }}
              aria-label="Cursed preset"
              className="h-9 w-full appearance-none rounded-lg border border-white/20 bg-[#14101d] pl-8 pr-8 font-sans text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-100 outline-none [color-scheme:dark] focus:border-crimson/50"
            >
              <option value="custom" disabled className="bg-crypt text-bone">Custom relic</option>
              {RITUAL_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id} className="bg-crypt text-bone">{preset.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-300" aria-hidden />
          </div>
          <button type="button" onClick={() => setGithubOpen((o) => !o)} aria-expanded={githubOpen} aria-controls="github-summon" className={`${toolButton} ${githubOpen ? "border-crimson/60 bg-crimson/10 text-[#EDE6D6]" : "border-white/20 bg-black/25 text-zinc-200 hover:text-[#EDE6D6]"}`}>
            <GitBranch className="h-3.5 w-3.5 text-amethyst-glow" aria-hidden />GitHub
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={`${toolButton} border-white/20 bg-black/25 text-zinc-200 hover:text-[#EDE6D6]`}>
            <Upload className="h-3.5 w-3.5 text-brass-light" aria-hidden />Upload
          </button>
          <button type="button" onClick={() => setDirectiveOpen((o) => !o)} aria-expanded={directiveOpen} aria-controls="ritual-directive-slot" className={`${toolButton} ${directiveOpen ? "border-crimson/60 bg-crimson/10 text-[#EDE6D6]" : "border-white/20 bg-black/25 text-zinc-200 hover:text-[#EDE6D6]"}`} title="Ritual directive">
            <Wand2 className="h-3.5 w-3.5 text-crimson" aria-hidden />
          </button>
          <input ref={fileRef} type="file" accept={`${RUNNER_LANGUAGES.map((i) => `.${i.extension}`).join(",")},.jsx,.mjs,.cjs,.mts,.cts,.txt`} onChange={handleUpload} className="hidden" />
        </div>

        {githubOpen && (
          <form id="github-summon" onSubmit={handleGithubSummon} className="space-y-1">
            <div className="flex gap-2">
              <input ref={githubInputRef} type="text" inputMode="url" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="Paste public GitHub file URL..." aria-label="Public GitHub file URL" spellCheck={false} autoComplete="off" className="h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-[#14101d] px-3 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-crimson/40" />
              <button type="submit" disabled={running || githubStatus.kind === "loading" || githubUrl.trim().length === 0} className="inline-flex h-9 items-center gap-1 rounded-lg border border-crimson/40 bg-crimson/10 px-3 font-sans text-[12px] font-semibold uppercase tracking-[0.08em] text-[#EDE6D6] disabled:opacity-50">
                {githubStatus.kind === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}Fetch
              </button>
            </div>
            {githubStatus.kind !== "idle" && (
              <p role={githubStatus.kind === "error" ? "alert" : "status"} className={`truncate font-mono text-[12px] ${githubStatus.kind === "error" ? "text-crimson" : githubStatus.kind === "success" ? "text-neon" : "text-zinc-300"}`}>{githubStatus.message}</p>
            )}
          </form>
        )}

        {directiveOpen && (
          <div id="ritual-directive-slot">
            <label htmlFor="ritual-directive" className="sr-only">Ritual directive (optional)</label>
            <input id="ritual-directive" type="text" value={directive} onChange={(e) => onDirectiveChange(e.target.value)} maxLength={320} placeholder="Ritual directive (optional): convert to strict TypeScript…" className="h-9 w-full rounded-lg border border-white/20 bg-[#14101d] px-3 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-crimson/40" />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-[13px] text-zinc-200" title={filename}>{filename}</span>
          <span className="relative shrink-0">
            <select value={language} onChange={(e) => onLanguageChange(e.target.value)} aria-label="Sandbox language" title={`Sandbox language: ${languageMeta.label}`} className="h-8 w-[92px] appearance-none rounded-md border border-white/20 bg-[#14101d] pl-2 pr-7 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] text-zinc-100 outline-none [color-scheme:dark] focus:border-crimson/50">
              {RUNNER_LANGUAGES.map((item) => (<option key={item.id} value={item.id} className="bg-crypt text-bone">{item.short}</option>))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-300" aria-hidden />
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
        <div className="grimoire-editor flex min-h-0 flex-1 overflow-hidden rounded-xl">
          <div ref={gutterRef} aria-hidden className="w-12 shrink-0 select-none overflow-hidden border-r border-brass/25 bg-black/25 pb-8 pr-2 pt-3 text-right font-mono text-[12px] leading-[20px] text-zinc-500 tabular-nums">
            {lines.map((_, index) => (
              <div key={index} className={(index + 1) % 10 === 0 ? "text-crimson/80" : undefined}>{index + 1}</div>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <pre ref={highlightRef} aria-hidden className={`pointer-events-none absolute left-0 top-0 m-0 whitespace-pre px-3 py-3 ${EDITOR_TEXT} text-[#EDE6D6] will-change-transform`}>
              {tokens.map((token, index) => token.kind === "plain" ? token.text : <span key={index} className={TOKEN_CLASS[token.kind]}>{token.text}</span>)}
              {"\n"}
            </pre>
            <textarea
              value={code}
              onChange={handleEditorChange}
              onScroll={(event) => {
                const { scrollTop, scrollLeft } = event.currentTarget;
                if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
                if (highlightRef.current) highlightRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
              }}
              rows={8}
              wrap="off"
              spellCheck={false}
              aria-label="Cursed code artifact"
              placeholder="// Paste a cursed artifact in any supported language…"
              className={`relative block h-full min-h-0 w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 ${EDITOR_TEXT} text-transparent caret-crimson outline-none selection:bg-crimson/35 placeholder:text-zinc-500`}
            />
          </div>
        </div>

        <div className="mt-2 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-zinc-300 tabular-nums">
            <span>{lines.length} Lines · {code.length} Chars</span>
            <span className={running ? "text-crimson" : phase === "complete" ? "text-neon" : "text-zinc-300"}>
              {PHASE_LABEL[phase].toUpperCase()} {progress}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-[#8B0000] via-crimson to-[#9333ea]" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ ease: "easeOut", duration: 0.35 }} />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <motion.button type="button" onClick={onRun} disabled={running} whileHover={running ? undefined : { scale: 1.01 }} whileTap={running ? undefined : { scale: 0.985 }} className="blood-cta h-12 min-w-0 flex-1 rounded-xl text-[13px] tracking-[0.14em] shadow-[0_0_30px_rgba(255,0,60,0.35)] disabled:shadow-none">
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Skull className="h-4 w-4" aria-hidden />}
            {running ? `Exorcising… ${progress}%` : "Exorcise Code"}
          </motion.button>
          <button type="button" onClick={onReset} disabled={running} title="Banish (reset)" aria-label="Banish and reset" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/15 bg-black/30 text-zinc-300 transition hover:border-crimson/50 hover:text-crimson disabled:opacity-40">
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
