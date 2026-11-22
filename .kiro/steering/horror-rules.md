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

## Occult Cyber-Gothic palette (locked)

| Token | Hex | Role |
| --- | --- | --- |
| `void` | `#040408` | Abyssal obsidian base (page, WebGL clear color) |
| `crimson` | `#FF003C` | Blood crimson: bugs, corruption aura, CTAs, rune dots |
| `amethyst` | `#9D4EDD` | Eldritch amethyst: channeling aura (`AURA_HEX.purple`), active seals |
| `neon` | `#00FF66` | Necrotic emerald: purified aura, sealed stages |
| `gold` / `bone` | `#E2D9C8` | Tarnished gold/bone: headings, primary text, sigil filigree |
| `gold.dim` / `gold.deep` | `#A89C82` / `#6B5E45` | Secondary labels, pending seals |
| `blood` / `haunt` / `spectral` | `#EF4444` / `#9333EA` / `#06B6D4` | Legacy accents still used by older components |

No electric-blue `#00F0FF`. No stock images or remote audio (only
`public/audio/horror-bgm.mp3`). No inline SVG *icons* (use `lucide-react`);
decorative SVG ornaments (`SigilFrame`, `SigilEmblem`, `SoulGauge`) are allowed.

## Typography

Loaded with `next/font/google` in `app/layout.tsx` (self-hosted at build time,
no runtime request to Google), exposed as CSS variables:

| Tailwind | Font | Use |
| --- | --- | --- |
| `font-brand` | Cinzel Decorative 700/900 | Brand wordmark only |
| `font-display` | Cinzel 500–700 | Panel titles, stage titles, tabs, ritual trigger, small headings |
| `font-sans` | Space Grotesk 400–700 | UI controls: buttons, pills, menus, hints |
| `font-mono` | JetBrains Mono 400–700 | Code, logs, diffs, numbers |

Minimum text size 12px. Primary text `text-bone`; secondary `text-bone/70–85`
or `text-gold-dim`.

## Sigil frames and surfaces

- Every dashboard panel is wrapped in `SigilFrame` (`components/SigilFrame.tsx`):
  four mirrored SVG corner brackets with filigree curls, a diamond rivet, and a
  blood rune dot, drawn as a non-scrolling overlay (`.sigil-corner`).
- `.horror-panel` adds a gold top rim and blood + amethyst inner aura shadows.
- Grimoire tabs are etched plates (`.arcane-plate`): chamfered `clip-path`,
  engraved inset rim, color from `--plate` (gold logs, amethyst diff,
  emerald sandbox).
- Editor surface `.grimoire-editor`: obsidian-parchment vignette with a dashed
  gold rune gutter (line numbers; every 10th line marked `ᛟ` in crimson).
  Lines do not wrap so the gutter stays aligned.
- `EXORCISE CODE` uses `.ritual-trigger`: a rotating conic energy border
  (`::before`) over a blood-etched fill (`::after`). It stays the only filled
  CTA in the Spellbook; `AUTO DEMO` is the header's blood-forged CTA.
- Health badge is a soul-purity gauge (`SoulGauge` in `Terminal.tsx`): a ring
  filled to the purified score with a gold tick at the original score.
- CRT layers are faded by `--crt-opacity: 0.10`. Decorative loops (ritual
  border, CRT sweeps, emblem ring) stop under `prefers-reduced-motion`.

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
   - Left: `SigilEmblem`, brand `NECROCODE` + `// OCCULT CODE EXORCIST`, and one engine badge
     (`Live AI engine` / `Builtin safety net`).
   - Right: `Auto demo` (crimson → violet gradient fill + glow, the header's
     one accent CTA), then quiet ghost buttons (`GHOST_PILL`: no fill,
     `border-white/10 text-zinc-300`) for `API Sigils`, `History`,
     and one `FX & Audio` popover (`components/FxMenu.tsx`) holding the
     `Horror BGM`, `3D Audio FX`, `CRT`, and `Fog` switches. No phase, SSE, or
     aura pills in the header (the Spellbook shows the phase, the Ritual Graph
     shows the aura).
   - Pills share `HEADER_PILL` (`h-8 shrink-0 whitespace-nowrap text-[12px]
     tracking-[0.1em]`); rows wrap, pills never shrink or clip.
1. **Left · Spellbook** (`ControlPanel`)
   - Cursed artifact presets, `GitHub` summon toggle (single-line URL form,
     `POST /api/github`) next to the upload button, runtime selector, ritual
     directive, code editor (`min-h-[260px] flex-1`, takes the free height),
     progress bar, “Exorcise Code” and “Banish ritual”.
   - `Exorcise Code` is the only filled, glowing CTA on the page (crimson →
     haunt gradient, white text, `h-12`). Every other button is outline.
   - No cursed/silenced/residual counter here; it lives only in the Grimoire
     Terminal footer.
2. **Center · 3D Ritual Graph** (`AgentCanvas` + `ExecutionGraph3D`)
   - Four interactive 3D seals: `Corrupted Code → Spectral Scanner →
     Kiro Exorcism Reasoning → Purified Output`.
   - Central polyhedron/skull relic with a crimson heartbeat while bugs exist,
     purple channeling while reasoning, and neon green when purified.
   - Click a seal to inspect its curse. Red pulsing border/aura on `error`.
   - After `complete`, a four-step timeline (`DORMANT · SCANNING · EXORCISING ·
     PURIFIED`) selects each stage for inspection.
   - Header `2D | 3D` toggle. 2D (`RitualGraph2D` in `AgentCanvas.tsx`) is a
     vertical DOM pipeline with the same `STATUS_HEX` colors, bug badge, and
     click-to-inspect card. It is the default when `prefers-reduced-motion`
     is set or WebGL is unavailable; a thrown canvas (`WebGLBoundary`) or a
     `webglcontextlost` event switches to 2D and disables the 3D option.
   - Before the first run (`idle`, no logs), the footer shows the helper
     `1. Paste or fetch code → 2. Click EXORCISE CODE → 3. Click any 3D seal to
     inspect`; it is replaced by the SSE sync line once a run starts.
3. **Right · Grimoire Terminal** (`Terminal`)
   - Fixed top block that never scrolls: title row (health badge), one
     toolbar row, then three tabs: `Logs`, `Spectral Diff`, `Sandbox`.
   - Toolbar row: `Test sandbox`, `Gen test` with an attached PASS/FAIL pill
     (full `smokeLabel()` text in the tooltip and for screen readers),
     `Copy`, and an `Export ▾` menu (`components/ExportMenu.tsx`) holding
     `Export Report (.md)`, `Download Git Patch (.patch)`, and
     `Download Artifact`. The row never wraps: a layout effect steps
     `density` full → compact → tight (shorter labels, then icons) until it
     fits; only the primary group may scroll as a last resort. Buttons share
     `ACTION_BUTTON` (`h-8 whitespace-nowrap text-[12px]`).
   - Tab badges: `Logs` pulses while running, `Spectral Diff` shows `-n +n`,
     `Sandbox` shows a status dot once output exists.
   - `Test sandbox` and `Gen test` switch to `Sandbox` (also on a language
     mismatch). `AUTO DEMO` stays on `Spectral Diff` and runs the sandbox in
     the background. A new run switches to `Logs`.
   - Footer: the cursed / silenced / residual summary (the only copy of it).
   - Header health badge `<before> → <after> /100`: crimson < 50, amber
     50–79, neon ≥ 80. Weights live only in `HEALTH_WEIGHTS` (`lib/report.ts`).
4. **Atmosphere** (`HorrorBackdrop`)
   - Fixed full-screen WebGL fog/embers and a giant wireframe relic behind the
     glass dashboard, reacting to the same SSE aura.

Desktop grid (`lg+`), center column widest:
- `lg` (1024–1279px): `minmax(0,1fr) minmax(0,1.35fr) minmax(0,1.1fr)`.
- `xl+`: `minmax(330px,1fr) minmax(440px,1.35fr) minmax(360px,1.1fr)`.
  The minimums total 1,130px + gaps + padding (~1,194px), so they only apply
  from `xl`; at `lg` they would overflow the viewport.
`gap-4`, page padding `px-4`, `lg:items-stretch`. Panel roots use
`h-full min-h-0 flex flex-col rounded-2xl`.

Mobile (`< lg`): a sticky three-tab switcher (`Spellbook` | `3D Ritual` |
`Grimoire`) shows one panel at a time. Panel wrappers are flex columns
sized by content between `min-h-[420px]` and `max-h-[78dvh]` (Ritual:
`min-h-[max(420px,60dvh)]`, since all its layers are absolute); the panel
inside fills the wrapper (`[&>*]:flex-1`). Switching tabs smooth-scrolls the
panel under the tab bar (`scroll-mt-16`; instant with reduced motion). The
grid uses `.pb-safe` (safe-area inset, `viewport-fit=cover`). All three
panels stay mounted. `Exorcise Code` and `AUTO DEMO` switch to `3D Ritual`;
restoring a history entry switches to `Grimoire`.

Glass: panels are `#0a0b14` at 90% with a 12px backdrop blur, keeping the
gradient rune border. CRT layers are faded by `--crt-opacity: 0.16` in
`globals.css` (effective line alpha ≈ 0.012).

Text: UI labels, buttons, and logs are 12–13px; nothing below 12px. Secondary
text is `text-zinc-300`/`zinc-400`, primary `text-zinc-200`/`zinc-100`
(`#E5E7EB`); no `slate` greys.

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
   `lib/runner.ts` (Paiza.IO, only for non-JavaScript sandbox runs), and
   `app/api/github/route.ts` (only `raw.githubusercontent.com`).

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
