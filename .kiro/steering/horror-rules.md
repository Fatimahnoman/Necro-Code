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
| `void` | `#050307` | Abyssal obsidian base (page, WebGL clear color) |
| `crimson` | `#FF003C` | Blood crimson: bugs, corruption aura, CTAs |
| `dried` | `#8B0000` | Dried blood: CTA fills, rose/arch panes, wax, ribbons, nave glow |
| `umbra` | `#4A154B` | Shadowy amethyst: stained-glass panes, ribbons, nave glow |
| `brass` | `#B08D57` (light `#D9B77E`, dark `#5E4524`) | Brass slots, banner edging, lead came, rivets, button rims |
| stone | `#050307` → `#0A060B` | Charcoal nave and panel stone |
| `amethyst` | `#9D4EDD` | Eldritch amethyst: channeling aura (`AURA_HEX.purple`), active seals |
| `neon` | `#00FF66` | Necrotic emerald: purified aura, sealed stages |
| `gold` / `bone` | `#E2D9C8` | Tarnished gold/bone: headings, primary text, sigil filigree |
| `gold.dim` / `gold.deep` | `#A89C82` / `#6B5E45` | Secondary labels, pending seals |
| `blood` / `haunt` / `spectral` | `#EF4444` / `#9333EA` / `#06B6D4` | Legacy accents still used by older components |

No electric-blue `#00F0FF`. No stock images or remote audio (only
`public/audio/horror-bgm.mp3`). No inline SVG *icons* (use `lucide-react`);
decorative SVG ornaments (`SigilFrame`, `GothicCrest`, `WaxSigil`, `CathedralNave`) are allowed.

## Typography

Loaded with `next/font/google` in `app/layout.tsx` (self-hosted at build time,
no runtime request to Google), exposed as CSS variables:

| Tailwind | Font | Use |
| --- | --- | --- |
| `font-brand` | Cinzel Decorative 700/900 | All headers, titles, panel headers, stage titles, ritual trigger (`font-display` is an alias of it) |
| `font-sans` | Space Grotesk 400–700 | Regular UI: buttons, pills, tabs, labels, menus, hints |
| `font-mono` | JetBrains Mono 400–700 | Code, logs, diffs, line numbers, scores, stage times |

Minimum text size 12px. Primary text `text-bone`; secondary `text-bone/70–85`
or `text-gold-dim`.

## Blood-Cathedral architecture & stained glass

- **Nave:** a fixed `.cathedral-stone` layer behind everything: charcoal stone
  with grain (`--stone-grain`) and dried-blood / umbra window glow.
- **Panels as cathedral windows** (`components/SigilFrame.tsx`):
  - A tall pointed-arch header (`ArchHeader`, 60px) carrying the panel
    title as its `<h2>` (Cinzel Decorative 15px): weathered stone gable
    (`feTurbulence` + `feDisplacementMap`), double moulding with a glowing
    stained-glass rim, two small lancets at the sides (clear of the title),
    finials, and a rose window at the apex.
  - Stained-glass filigree strips down both sides (`.glass-strip-crimson`
    for the Spellbook, `.glass-strip-violet` for the Grimoire,
    `.glass-strip-stone` pilasters for the Ritual Graph): a leaded diamond
    mosaic with glow, overlaying the panel's outer padding only.
  - Filigree corners at the base. Titles live only in the arch header.
- `.horror-panel` is carved stone with dried-blood light at the top and
  umbra at the base. `.rune-border` is a leaded stained-glass rim.
- **Spellbook** is an open tome (`.tome-panel`): aged vellum, red margin
  rule, weathered margins. Inputs sit in `.brass-slot`s.
- **Editor:** a highlighted `<pre>` (`lib/highlight.ts`: comments, strings,
  numbers, keywords per language family) behind a transparent `<textarea>`;
  both use `EDITOR_TEXT` (JetBrains Mono 13px / 20px, no ligatures, tab 4)
  and the `<pre>` follows the textarea scroll via a transform. Lines do not
  wrap. The gutter (brass double rule, every 10th line `ᛟ`) follows the
  vertical scroll. Colors: keyword `#FF5C86`, string `#3EF29A`, comment
  gold-dim, number amber.
- **`EXORCISE CODE`** (`.ritual-trigger`, 60px tall): dried-blood → crimson
  fill, rotating flame border, pulsing `ember-burn` glow, `WaxSigil`, and an
  `SSE` pill (shows the progress % while running). `BANISH RITUAL` is a
  narrower `.medieval-btn` below it.
- **Grimoire:** etched dark-stone tabs (`.arcane-plate`; selected tab gets a
  leaded multi-color stained-glass border). Soul-purity is a labeled bar:
  `SOUL-PURITY <before> → <after> /100`, fill to `after` (dried blood →
  tier color: crimson < 50, amber 50–79, neon ≥ 80) with a bone tick at
  `before`; it reads "Awaiting ritual" / "Not scored for this runtime"
  without scores. Toolbar buttons are `.medieval-btn`. The Corruption
  Report plaque has three stained-glass panes and a `PURIFIED` / `RESIDUAL`
  verdict plate.
- **Dread layer:** `.breathing-vignette` (pitch-black edges, 9s breathe)
  behind the dashboard and a corners-only `.corner-vignette` in front;
  `.crimson-tendrils` (blurred dried-blood / umbra fog creeping along floor
  and walls, with the Fog toggle). `.cursed-glitch` adds a brief crimson /
  violet chromatic-aberration micro-glitch (filter + translate, quiet ~92% of
  a 7.3s cycle) to the header subtitle and arch titles. `.candle-flicker`
  gutters the stained-glass strips and arch rims.
- **Ritual shock:** clicking `EXORCISE CODE` (or AUTO DEMO) runs a 560ms
  screen shake on the dashboard wrapper and a 900ms blood flash overlay
  (Web Animations API on refs; no re-render).
- Text: primary `bone` is `#EDE6D6`; nothing under 12px.
- CRT layers are faded by `--crt-opacity: 0.08`. Decorative loops stop under
  `prefers-reduced-motion`.


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
   - Left: `GothicCrest` (shield, crimson field, gold "N") + `<h1>`
     `NECROCODE // AI CODE EXORCIST` (Cinzel Decorative 24px; "// AI Code
     Exorcist" in crimson).
   - Right, in order: `AUTO DEMO` (blood-forged gradient, the header's accent
     CTA), `HISTORY [n]`, `API SIGILS` (with the engine status dot: green =
     live AI engine, dim = builtin safety net; full status in its tooltip
     and accessible name), and the `FX & Audio` popover (Horror BGM,
     3D Audio FX, CRT, Fog). Ghost pills (`GHOST_PILL`) for all but AUTO DEMO.
   - Pills share `HEADER_PILL` (`h-8 shrink-0 whitespace-nowrap`); rows
     wrap, pills never shrink or clip.
1. **Left · Cursed Spellbook** (`ControlPanel`), top to bottom:
   - Row (wraps the tools under the preset when the column is narrow, so
     nothing is squeezed or clipped): preset select · `GitHub` · `Upload` · directive toggle (wand; a
     dot shows when a directive is set; the slot opens automatically when a
     directive is set, e.g. by AUTO DEMO). The GitHub URL form and the
     directive input open below the row.
   - Filename + runtime selector.
   - `LINES` and `CHARS` counters, then the phase label + `%` progress bar.
   - The tall syntax-highlighted editor (`min-h-[240px] flex-1`).
   - `EXORCISE CODE` (only filled CTA in the panel) and `BANISH RITUAL`.
   - No cursed/silenced/residual counter here.
2. **Center · Ritual Graph** (`AgentCanvas` + `ExecutionGraph3D`)
   - Cathedral nave backdrop, skull on the tilted altar, four lancet-window
     seals (see `3d-horror-rules.md`). Click a seal or a stage card to
     inspect it.
   - Header row: `2D | 3D` toggle + hint (left), aura pill + bug count
     (right). 2D (`RitualGraph2D`) is the default for reduced motion or no
     WebGL; `WebGLBoundary` / `webglcontextlost` switch to 2D.
   - Base: one line (the first-run helper `1. Feed the Crypt → 2. Ignite
     EXORCISE CODE → 3. Inspect the Altar Seals` while idle with no logs,
     otherwise the SSE ↔ 3D sync line), then four stage cards that are
     always visible: `DORMANT` · `SCANNING` · `EXORCISING` · `PURIFIED`,
     each with its live status word (Awaiting / Channelling / Sealed /
     Cursed) and status-colored border.
3. **Right · Grimoire Terminal** (`Terminal`), top to bottom (fixed block
   that never scrolls, then the viewport):
   - Tabs `TERMINAL` · `SPECTRAL DIFF` (shown as `DIFF` below `xl`, full
     name kept as the accessible name) · `SANDBOX` (badges: Terminal pulses
     while running, Diff shows `-n +n`, Sandbox shows a status dot).
   - The soul-purity bar.
   - One toolbar row: `GEN TEST` (+ PASS/FAIL pill), `TEST SANDBOX`, `COPY`,
     `Export ▾` (`Export Report (.md)`, `Download Git Patch (.patch)`,
     `Download Artifact`). The row never wraps: `density` steps full →
     compact → tight until it fits.
   - Active tab viewport (logs / diff / sandbox).
   - `CORRUPTION REPORT` footer card (the only copy of the counts).
   - `TEST SANDBOX` and `GEN TEST` switch to `SANDBOX`; AUTO DEMO stays on
     `SPECTRAL DIFF` and runs the sandbox in the background; a new run
     switches to `TERMINAL`.
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
