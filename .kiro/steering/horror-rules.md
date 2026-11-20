# NecroCode — Horror Rules & Architecture Covenant

> Authoritative steering for the Haunted AI Code Exorcist.
> If another document disagrees, this file wins.
> 3D/WebGL-specific rules live in `#[[file:3d-horror-rules.md]]`.

## Mission

NecroCode is a **haunted cyber-gothic AI exorcist HUD**. The user feeds it a
source artifact; for JavaScript/TypeScript/TSX the server statically hunts
syntax and logic corruption and applies safe counter-sigils. With optional BYOK
keys it also asks Gemini → Groq → OpenRouter for a live rewrite. The exorcism
streams over SSE and returns a purified artifact. It is a UI/UX costume-contest
piece **and** a working analysis tool — never a fake spinner.

Spec: `#[[file:../specs/necrocode-exorcist/design.md]]`

## Palette (locked)

| Token | Hex | Role |
| --- | --- | --- |
| `void` | `#06060c` | Pitch-black base (`tailwind.config.ts`, `globals.css`) |
| `crypt` / `charnel` | `#070A10` / `#0B0F17` | Panel depths |
| `blood` | `#EF4444` | Bugs, danger, active curses |
| `haunt` | `#9333EA` | Reasoning, runes, secondary glow |
| `spectral` | `#06B6D4` | Scanning, system logs, active seals |
| `ectoplasm` | `#4ADE80` | Cleansed / fixed / success |
| `crimson` | `#FF003C` | 3D processing bugs / corruption aura |
| `neon` | `#00FF66` | 3D exorcised aura / purified seals |
| `bone` | `#E5E7EB` | Primary text |

No electric-blue `#00F0FF` palette from the old visual-agent build. No stock
images, no remote audio assets (the only audio file is the bundled
`public/audio/horror-bgm.mp3`), no inline SVG icons (use `lucide-react`).

## Theme primitives

- **Pitch-black void** with a drifting fog layer and a haunted rune grid.
- **Flickering CRT scanlines** (global overlay + terminal-local scanlines).
- **Glowing rune borders** via the `.rune-border` gradient utility and corner
  rune glyphs (`ᚱ ᚨ ᛟ ᛉ`).
- **Glassmorphism** via `.glass` / `.glass-strong`.
- **Floating node icons** using Framer Motion; active nodes float faster.
- **Blood pulse** (`animate-blood-pulse`) for detected bugs.
- **Ectoplasm glow** for cleansed nodes; **spectral pulse** while scanning.

## Layout contract

Three-pane HUD, responsive, zero horizontal scroll:

0. **Header** (`app/page.tsx`)
   - `NECROCODE` + `// AI CODE EXORCIST`, `AUTO DEMO`, `API Sigils`, `History`,
     `Horror BGM`, `3D Audio FX`, CRT and fog toggles, phase `StatusPill`
     (`text-[9.5px] px-2.5 py-1 gap-1.5`, must not clip at the right edge).
1. **Left · Spellbook** (`ControlPanel`)
   - Cursed artifact presets, upload button, runtime selector, ritual
     directive, line-numbered code editor, progress bar, summary chips,
     “Exorcise Code” and “Banish ritual”.
2. **Center · 3D Ritual Graph** (`AgentCanvas` + `ExecutionGraph3D`)
   - Four interactive 3D seals: `Corrupted Code → Spectral Scanner →
     Kiro Exorcism Reasoning → Purified Output`.
   - Central polyhedron/skull relic with a crimson heartbeat while bugs exist,
     purple channeling while reasoning, and neon green when purified.
   - Click a seal to inspect its curse. Red pulsing border/aura on `error`.
   - After `complete`, a four-step timeline (`DORMANT · SCANNING · EXORCISING ·
     PURIFIED`) selects each stage for inspection.
3. **Right · Grimoire Terminal** (`Terminal`)
   - `Terminal` / `Spectral Diff` tabs (unified diff with dual line gutters),
     color-coded logs, copy, download, `GEN TEST`, `Test sandbox`, `Export
     report`, footer summary.
4. **Atmosphere** (`HorrorBackdrop`)
   - Fixed full-screen WebGL fog/embers and a giant wireframe relic behind the
     glass dashboard, reacting to the same SSE aura.

Grid: `grid-cols-1 gap-3` on mobile (stacked); `lg:grid-cols-3 lg:gap-3.5
lg:items-stretch` on desktop (three equal columns). Panel roots use
`h-full min-h-0 flex flex-col justify-between rounded-2xl`.

Typography: brand `text-xl font-extrabold tracking-[0.16em]`; panel headings
(`Spellbook`, `Ritual Graph`, Terminal title) `text-xs font-bold uppercase
tracking-[0.15em]`.

## Authoritative stack

- **Next.js 15** App Router, route handlers for SSE.
- **TypeScript strict** — no `any`, no untyped public APIs.
- **Tailwind CSS 3** with tokens in `tailwind.config.ts`.
- **Framer Motion 11** for node float, pulse, log entry, progress.
- **React Three Fiber 9 + Drei 10 + Three.js** for the 3D horror layer,
  imported client-only with `ssr: false`.
- **lucide-react** for every icon.
- **HTML5 Audio** for the bundled `/audio/horror-bgm.mp3` loop (soft `0.22`
  idle volume, `0.85` during scanning/reasoning), plus **Web Audio API** for
  synthesized haunted SFX. BGM and 3D FX have independent toggles and engines.
- Runtime: Node.js route (`dynamic = "force-dynamic"`, `runtime = "nodejs"`).

## Static exorcism engine contract

`lib/analyzer.ts` must stay deterministic and dependency-free:

1. `maskCode` replaces string/template/comment bodies with spaces while
   preserving offsets; `maskComments` strips comments but keeps strings.
2. Syntax seal: detect unterminated strings, stray/mismatched/unclosed brackets.
   Unclosed `{` blocks are sealed at the end of the snippet.
3. Corruption rules: loose equality, `var`, `debugger`, `eval`, radix-less
   `parseInt`, off-by-one `.length` loops, unbounded `while (true)` / `while (1)`,
   assignment in `if`, empty `catch`, thrown strings, leaked secrets,
   `innerHTML`, `document.write`, `with`, `alert`, `NaN` comparisons,
   `setInterval` without `clearInterval`, TODO/FIXME, console residue.
4. Safe auto-fixes only: no semantic guesses where intent is unknown. Unsafe
   rules are reported but left for a human. Unclosed `(` / `[` and unterminated
   strings remain unsafe.
5. Report shape: `ExorcismReport` with `findings`, `appliedFixes`, `remaining`,
   `summary` (detected/fixed/unresolved/severity counts).
6. Input is capped at **24,000 chars** server-side (directive at 500).
7. The analyzer itself makes no network calls. Network access lives only in
   `lib/liveEngine.ts` (BYOK LLM, only when sigils are present) and
   `lib/runner.ts` (Paiza.IO, only for non-JavaScript sandbox runs).

## Live engine contract

- Order: Gemini (`gemini-2.5-flash`) → Groq (`llama-3.3-70b-versatile`) →
  OpenRouter (`openrouter/auto`); 8-second timeout each.
- Keys travel only in `x-necro-gemini-key`, `x-necro-groq-key`,
  `x-necro-openrouter-key` headers; never in bodies, logs, or SSE payloads.
- Any failure falls through to the next provider, then to the Heuristic result.

## SSE contract

- Endpoint: `POST /api/agent/stream` with
  `{ "code": string, "directive"?: string, "language"?: string }`.
- Fallback: `GET /api/agent/stream?code=...&directive=...&language=...`.
  Empty code uses the default cursed artifact.
- Frames: `event: agent\ndata: <AgentEvent JSON>\n\n`.
- Headers: `text/event-stream`, `no-cache, no-transform`, `keep-alive`,
  `X-Accel-Buffering: no`.
- Phases: `idle · thinking · tool_call · executing · complete`.
- Node statuses: `pending · active · done · error`.
- Progress advances per processed stage; final event is `100`, carries
  `summary` and `finalCode`.
- On client disconnect, close the stream silently.

## Conventions

- Shared types live in `lib/types.ts`; server and client import the same
  contract.
- Client components are marked `"use client"` and kept lean.
- Server-only analysis lives in `lib/analyzer.ts` (no DOM, no React).
- Cursed sample code lives in `lib/cursedCode.ts` (no icon imports so the route
  can import it safely).
- Prefer design tokens and named animations over ad-hoc hex/shadow values.
- Keep `npm install && npm run build` at **zero errors** — hard requirement.

## Non-functional requirements

- **Responsive:** three panes stack on mobile; editor and terminal scroll.
- **Accessible:** real buttons, `aria-pressed`, labels, `role="log"`.
- **Resilient:** abortable fetch stream, reconnect via a fresh run, safe resets.
- **Bounded:** capped findings/fix logs (18 each) and streamed code lines (260);
  the full artifact is still copyable/downloadable.
