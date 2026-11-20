# NecroCode — Horror Rules & Architecture Covenant

> Authoritative steering for the Haunted AI Code Exorcist.
> If another document disagrees, this file wins.
> 3D/WebGL-specific rules live in `#[[file:3d-horror-rules.md]]`.

## Mission

NecroCode is a **haunted cyber-gothic AI exorcist HUD**. The user feeds it a
real JavaScript/TypeScript snippet; the server statically hunts syntax and
logic corruption, streams the exorcism over SSE, applies safe counter-sigils,
and returns a purified artifact. It is a UI/UX costume-contest piece **and** a
working static-analysis demo — never a fake spinner.

## Palette (locked)

| Token | Hex | Role |
| --- | --- | --- |
| `void` | `#030508` | Pitch-black base |
| `crypt` / `charnel` | `#070A10` / `#0B0F17` | Panel depths |
| `blood` | `#EF4444` | Bugs, danger, active curses |
| `haunt` | `#9333EA` | Reasoning, runes, secondary glow |
| `spectral` | `#06B6D4` | Scanning, system logs, active seals |
| `ectoplasm` | `#4ADE80` | Cleansed / fixed / success |
| `crimson` | `#FF003C` | 3D processing bugs / corruption aura |
| `neon` | `#00FF66` | 3D exorcised aura / purified seals |
| `bone` | `#E5E7EB` | Primary text |

No blue/purple/green palette from the old visual-agent build. No stock images,
no external/remote audio assets, no inline SVG icons (use `lucide-react`).

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

1. **Left · Ritual Spells & Bug Exorcism** (`ControlPanel`)
   - Cursed artifact presets, upload button, line-numbered code editor window,
     progress bar, summary chips, “Exorcise Code” and “Banish ritual”.
2. **Center · 3D Ritual Graph** (`AgentCanvas` + `ExecutionGraph3D`)
   - Four interactive 3D seals: `Corrupted Code → Spectral Scanner →
     Kiro Exorcism Reasoning → Purified Output`.
   - Central polyhedron/skull relic with a crimson heartbeat while bugs exist,
     purple channeling while reasoning, and neon green when purified.
   - Click a seal to inspect its curse. Red pulsing border/aura on `error`.
3. **Right · Grimoire Terminal** (`Terminal`)
   - Translucent cyber-gothic terminal, red/purple glowing logs, auto-scroll,
     one-click copy + download of the purified artifact, footer summary.
4. **Atmosphere** (`HorrorBackdrop`)
   - Fixed full-screen WebGL fog/embers and a giant wireframe relic behind the
     glass dashboard, reacting to the same SSE aura.

Widths: left `360px–380px`, center `minmax(0, 1fr)`, right `400px–430px` on desktop; stacked on mobile.

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
   TODO/FIXME, console residue.
4. Safe auto-fixes only: no semantic guesses where intent is unknown. Unsafe
   rules are reported but left for a human. Unclosed `(` / `[` and unterminated
   strings remain unsafe.
5. Report shape: `ExorcismReport` with `findings`, `appliedFixes`, `remaining`,
   `summary` (detected/fixed/unresolved/severity counts).
6. Input is normalized to `\n`, capped at **24,000 chars** server-side.
7. No external network calls, API keys, or LLM calls in v1.

## SSE contract

- Endpoint: `POST /api/agent/stream` with `{ "code": string }`.
- Fallback: `GET /api/agent/stream?code=...` (also returns the default cursed
  artifact when empty).
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
