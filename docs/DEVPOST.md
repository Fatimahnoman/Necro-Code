# 🕯️ NecroCode — Kiroween 2026 Devpost Submission

> **3D Horror AI Code Exorcist Studio** · UI/UX Track (Costume Contest)
> Built with **Kiro** · Next.js 15 · React Three Fiber · Tailwind CSS · SSE

| | |
| --- | --- |
| **Tagline** | Feed the crypt a cursed snippet, watch the 3D ritual graph hunt real bugs, and copy the purified artifact. |
| **Track** | UI/UX (Costume Contest) |
| **Built with** | Kiro (Specs · Steering · Hooks), Next.js 15, TypeScript, Three.js, React Three Fiber, Drei, Tailwind CSS, Framer Motion, HTML5 Audio, Web Audio API, Server-Sent Events, Blob Web Workers, localStorage |
| **Try it** | `npm install && npm run dev` → http://localhost:3000 |
| **No setup** | No `.env`, database, textures, or 3D models. The BGM is bundled locally; SFX are synthesized. The deterministic safety net works offline; optional BYOK keys stay in the browser. |

---

## 💡 Inspiration

AI agents usually hide their reasoning behind a spinner. We wanted to rip the
cover off and turn an agent run into a **ritual you can watch, orbit, hear, and
feel** — a haunted 3D altar where every stage is a physical seal and every real
finding leaves a mark on the room.

Kiroween's costume-contest energy pushed us toward a **premium 3D horror
cyber-gothic studio**: floating embers, a giant wireframe relic, crimson
heartbeats when corruption is found, and neon-green relief when the artifact is
purified. Running the analyzer is framed as an **exorcism**; the cursed code is
the patient, the deterministic engine is the rite, and the 3D graph is the
ritual circle.

We also wanted the project to be a genuine **Kiro-native** showcase — not just an
app built with an AI assistant, but an app whose architecture is shaped by
Kiro's **Specs**, **Steering Docs**, and **Agent Hooks**.

---

## 🎛️ What it does

NecroCode is a responsive three-pane horror studio wrapped around a **real
JavaScript/TypeScript static analyzer**, with a **29-runtime sandbox** for
verifying the purified artifact in almost any language.

- **Left — Spellbook Code Editor.** Pick a cursed preset (including
  **Infinite Loop**, **Memory Leak**, and **Syntax Corruption**), upload a file,
  or paste your own snippet. Add an optional **RITUAL DIRECTIVE** (for example,
  "convert to strict TypeScript"), then press the glowing **EXORCISE CODE**
  button to start the ritual.
- **Center — Interactive 3D Ritual Graph.** Four WebGL seals orbit a central
  polyhedron/skull relic:
  **Corrupted Code → Spectral Scanner → Kiro Exorcism Reasoning → Purified
  Output**. Real SSE `nodeStatus` events light each seal, flow orbs travel the
  active edge, and the scanner shows a live bug-count badge. Clicking any seal
  opens an X-Ray inspector HUD with the active engine, stage execution time in
  ms, bug severity breakdown, and stage status.
- **Right — Grimoire Terminal.** A translucent terminal streams every real
  finding, every safe counter-sigil, and the purified code line-by-line. Switch
  to **SPECTRAL DIFF** for a line-by-line original vs purified comparison with
  crimson `-` removals and emerald `+` additions. The corruption report shows
  `cursed / silenced / residual`; one click copies or downloads the full
  `finalCode`, and **EXPORT REPORT** downloads a Markdown exorcism autopsy with
  the timestamp, engine, findings, applied fixes, and both code blocks.
  **TEST SANDBOX** runs JavaScript locally in an isolated Web Worker with a hard
  2-second timeout, showing captured console output, the final return value,
  runtime errors, and timeout status. Network globals are sealed inside the
  worker; Node and DOM globals are not polyfilled, so host-specific snippets
  surface an honest runtime error. A runtime selector beside the filename opens
  **28 more languages** — TypeScript, TSX, Python 3, Java, C, C++, C#, Go, Rust,
  Ruby, PHP, Kotlin, Swift, Scala, Haskell, Elixir, F#, D, Perl, R, Bash, SQL,
  Scheme, Common Lisp, Visual Basic, Objective-C, CoffeeScript, and COBOL.
  Non-JavaScript runs are proxied through `/api/run` to Paiza.IO, normalized into
  stdout / stderr / build output / exit code, and marked `REMOTE` in the panel.
- **Header — API SIGILS + HISTORY.** **API SIGILS** opens a BYOK modal for
  Gemini, Groq / Grok, and OpenRouter keys and shows whether the next run will
  use `LIVE AI ENGINE` or the `BUILTIN SAFETY NET`. **HISTORY** opens a
  slide-over drawer with the last 10 completed exorcisms; one click restores the
  original code, directive, filename, findings, fixes, engine, summary, and
  slimmed logs without re-running.
- **Atmosphere.** A fixed full-screen WebGL backdrop adds embers, pointer
  parallax, sparkles, and a giant rotating wireframe relic behind the glass
  panels. CRT scanlines, fog, vignette, rune borders, and glassmorphism are all
  toggleable.
- **Horror Audio.** `/audio/horror-bgm.mp3` loops at a soft `0.22` volume,
  starting immediately when autoplay is allowed or on the browser's first
  gesture. It surges to `0.85` during scanning/reasoning, then fades back to
  `0.22` once purified. `EXORCISE CODE` adds a stereo-panned `DHUM!` sub-bass
  slam. `HORROR BGM` and `3D AUDIO FX` are independent: the BGM toggle never
  mutes stage SFX, and the FX toggle never silences the soundtrack.

### The aura is the state

| Aura | Hex | When |
| --- | --- | --- |
| Dormant | `#7C3AED` | Idle, slow breathing |
| Crimson | `#FF003C` | Real bugs present / unresolved findings remain |
| Purple | `#A855F7` | Channeling, scanning, reasoning |
| Neon | `#00FF66` | Purified, zero unresolved findings |

The central relic lerps between colors instead of snapping. The left progress
bar, header pills, 3D seals, and terminal all read from the same SSE events.

---

## 🔬 The analysis is real

The builtin engine is deterministic and dependency-free:

- Masks strings, templates, and comments while preserving offsets.
- Checks syntax seals: unterminated strings, stray/mismatched/unclosed brackets.
- Hunts loose equality, legacy `var`, `debugger`, `eval`, radix-less
  `parseInt`, off-by-one `.length` loops, unbounded `while (true)` loops,
  assignment inside `if`, empty `catch`, thrown strings, leaked secrets,
  `innerHTML`, `document.write`, `with`, `alert`, `NaN` comparisons, TODO/FIXME
  residue, console residue, and `setInterval` without `clearInterval`.
- Applies **safe fixes only**: strict equality, scoped bindings, bounded loops,
  sealed `{` blocks, and the other deterministic rewrites above. Unsafe findings
  (`eval`, `document.write`, `with`, `alert`, unterminated strings, unclosed
  `(` / `[`, undying intervals) stay unresolved and are counted in the report.

### Optional live rewrite, always with a safety floor

The deterministic scan is not optional — it always runs first and produces the
findings, summary, and fallback artifact. If the user has stored BYOK sigils,
the route then tries **Gemini → Groq → OpenRouter**, giving each provider an
8-second timeout. The Groq / Grok slot uses Groq's OpenAI-compatible endpoint
with `llama-3.3-70b-versatile`. A successful response becomes the purified
artifact and is re-analyzed for residual findings. Any failure, timeout, or
unusable response falls through to the next provider and ultimately to the
builtin `Heuristic` engine.

Keys never enter the request body, terminal, report, or history. The browser
stores them in `localStorage` and sends them only as
`x-necro-gemini-key`, `x-necro-groq-key`, or `x-necro-openrouter-key` to this
app's own route. The header status badge reflects the active or last run, so a
configured key that failed is shown honestly as `BUILTIN SAFETY NET`, not as a
live success.

The submitted verification covered the BYOK UI, header plumbing, timeout, and
dummy-key fallback path end to end. Live provider success itself depends on a
valid key, model access, and the provider's current availability, so it is not
part of the deterministic test suite.

The route streams real `AgentEvent` frames over
`POST /api/agent/stream`:

```json
{
  "seq": 6,
  "phase": "executing",
  "stage": "glitch_scanner",
  "nodeStatus": "error",
  "level": "warn",
  "message": "[spectral_scanner] [L3] Undying interval...",
  "progress": 25,
  "bug": { "id": "undying-interval", "severity": "warning" }
}
```

The server never knows WebGL exists. The client reducer turns the same events
into 3D seal states, terminal lines, progress, and optional SFX.

---

## 🛠️ How we built it with Kiro

We leaned on all three of Kiro's core primitives and committed them to the repo
as first-class artifacts.

### 📋 Specs — we designed before we built

- [`.kiro/specs/necrocode-exorcist/requirements.md`](../.kiro/specs/necrocode-exorcist/requirements.md) formalizes
  the multi-LLM fallback, four ritual stages, `AgentEvent` contract, analyzer
  rules, safe-fix policy, UI behaviour, and acceptance criteria.
- [`.kiro/specs/necrocode-exorcist/design.md`](../.kiro/specs/necrocode-exorcist/design.md) is the
  3D studio design: aura state machine, WebGL component contracts, SSE-to-node
  animation mapping, performance constraints, fallback pipeline, and acceptance
  criteria.

Both specs link to the shared `lib/types.ts` via Kiro's `#[[file:…]]` syntax so
the server route and the React client never drift.

### 🧭 Steering Docs — we kept Kiro on-brand

- [`.kiro/steering/3d-horror-rules.md`](../.kiro/steering/3d-horror-rules.md)
  locks the 3D palette, two-canvas scene architecture, low-poly/DPR performance
  rules, transparent-clear-color rule, screen-space label contract, and SSR
  safety.
- [`.kiro/steering/horror-rules.md`](../.kiro/steering/horror-rules.md) is the
  authoritative horror covenant: palette, fog/scanline/rune/glass primitives,
  three-pane layout, analyzer contract, SSE contract, and zero-error build rule.

Because steering is injected into every interaction, Kiro consistently produced
code that matched the 3D horror system without us re-explaining it each turn.

### 🪝 Agent Hooks — we modeled the transitions

[`.kiro/hooks/agent-execution.json`](../.kiro/hooks/agent-execution.json) maps
every stage transition to a 3D aura, seal animation, terminal effect, and
stereo-panned SFX: `crimson-heartbeat`, `relic-ring-spin`, `neon-heal-flash`,
`complete-pulse`, and more.

### ⚙️ Implementation

With the specs and steering in place, Kiro scaffolded the Next.js 15 App Router
project, the deterministic analyzer, the SSE route, the `useAgentStream` POST
stream client, the React Three Fiber scene, the horror UI system, and the
Web Audio engine — iterating pane by pane and polishing the 3D interactions
last.

---

## 🧗 Challenges we ran into

- **Real analysis, not theater.** It would have been easy to animate a fake
  progress bar. We built a real masking/detection/fix engine and made every 3D
  transition consume its actual events. Unsafe findings intentionally remain
  unresolved.
- **WebGL + Next.js SSR.** Three.js touches `window` and can break static
  generation. We kept every 3D module client-only with `next/dynamic` and
  `ssr: false`, and call `gl.setClearColor(0x000000, 0)` so the CSS fog and
  vignette remain visible through the canvas.
- **One focal point, not five competing ones.** Earlier iterations had too many
  panels and animations. We rewrote the center as a single ritual altar, quieted
  the side panels, and reduced the aura to one locked palette.
- **Labels over WebGL without React portals.** Drei's `Html` mounts a nested
  React root and, under React 19 StrictMode, unmounts it while React is still
  rendering. We replaced it with a screen-space DOM overlay that projects each
  3D node anchor every frame, keeps `pointer-events: none`, and sizes itself to
  the canvas so labels never clip on mobile. We also filter the upstream R3F
  `THREE.Clock` deprecation advisory while leaving every real three.js warning
  and error intact.
- **Audio that respects the browser.** Autoplay policies block audible playback
  until a user gesture. The BGM hook tries at mount, then arms one-shot
  `pointerdown` / `keydown` / `touchstart` listeners as a fallback. The lazy SFX
  `AudioContext` initializes on first interaction, resumes if suspended, and
  pans each blip across the stereo field; `3D AUDIO FX` defaults to **off**.
- **BYOK without leaking secrets.** API keys are stored only in the browser,
  never written into the POST body, terminal, report, or history. They travel to
  the app's own route as dedicated headers, and every provider attempt is
  wrapped in an 8-second timeout so a hostile or broken network cannot stall the
  entire ritual.
- **Running purified code without trusting it blindly.** JavaScript stays inside
  a Blob-backed Web Worker rather than `eval` on the main thread: console methods
  and the return value are captured, common network globals are sealed, output is
  clamped to 80 lines, and the worker is terminated at 2 seconds. Non-JavaScript
  languages cannot run safely in the browser, so a server route enforces a
  language allowlist, a 24,000-character source cap, a 20-second server deadline,
  and normalized output before forwarding to the public Paiza.IO guest runner.
  The client shows a `REMOTE` badge and a privacy warning before the first remote
  run. This is a test bench, not a security boundary for hostile code.
- **Language-aware exorcism.** The deterministic scanner is deliberately
  JS/TS-only. For other runtimes, the route skips fake findings, warns that the
  builtin rules do not apply, passes the artifact through, and lets the optional
  live AI engine perform repairs when a key is configured. The sandbox then
  verifies the result in the selected runtime.
- **History that restores results, not duplicates.** The last 10 entries strip
  the duplicated streamed code transcription, then restore the original code,
  directive, filename, runtime, findings, fixes, engine, summary, and logs. A
  fingerprint guard prevents a restored entry from being saved again as a
  brand-new run.
- **Zero-config deploy.** No `.env`, database, textures, or 3D assets are
  required. The deterministic engine and browser-stored BYOK sigils keep the
  default path keyless, the public Paiza.IO guest runner powers non-JS sandbox
  runs, and the horror BGM is bundled in `public/audio/`, so
  `npm install && npm run build` still succeeds on a fresh machine.

---

## 🏆 Accomplishments that we're proud of

- A genuinely **cinematic 3D agent-reasoning visualization**: orbiting seals, a
  skull/polyhedron relic, flowing edge orbs, a crimson heartbeat, and a
  purple → neon aura resolution.
- **Real static analysis** with a safe-fix policy and honest residual reporting.
- **Optional live AI without losing the floor** — BYOK Gemini / Groq /
  OpenRouter rewrites with graceful fallback to the deterministic engine.
- **A real sandbox and renewable grimoire** — local JavaScript execution with a
  2-second timeout, 28 remote runtimes behind an allowlisted server proxy, plus a
  last-10 browser history with one-click restoration.
- **1:1 SSE-to-3D synchronization** — no fake seal progress.
- **Adaptive bundled horror BGM** plus fully synthesized, stereo-panned SFX.
- A repository that is a **living Kiro-native workflow** — Specs, Steering, and
  Hooks are real, committed, and load-bearing.
- **Zero-config deploy** to Vercel, strict TypeScript, responsive layout, and a
  zero-error production build.

---

## 🔮 What's next for NecroCode

- **Provider-aware live streaming.** Stream model tokens into the terminal and
  add per-provider model/pinning controls on top of the current 8-second
  fallback chain.
- **More corruption families.** Type-aware checks, React hook rules, async/await
  hazards, and dependency-level scanning.
- **Ritual replay.** Record a run and generate a shareable, replayable link with
  the exact SSE timeline and 3D camera path.
- **Custom stage graphs.** Let users define their own ritual seals via a schema.
- **Theme packs.** More costume themes beyond the crimson crypt.

---

## 🎬 3-Minute Demo Video Script

> **Total runtime target: ~3:00.** Record at 1080p+. Enable **3D AUDIO FX**
> before recording so transitions are audible. Tone: confident, cinematic, a
> little spooky.

### `0:00 – 0:20` — Cold open / hook

- **On screen:** The full NecroCode studio at rest — drifting embers, the giant
  wireframe relic, the central 3D skull altar, crimson/purple/neon palette.
- **Narration:** "Most AI agents hide their thinking behind a spinner. NecroCode
  drags the ritual into the open: a 3D horror code-exorcist studio built with
  Kiro, where every real bug leaves a mark on the room."

### `0:20 – 0:45` — The three panes

- **On screen:** Slowly orbit the center graph; click a 3D seal; sweep across
  the spellbook, grimoire terminal, and header controls. Briefly point to
  **API SIGILS**, **HISTORY**, and the `BUILTIN SAFETY NET` badge.
- **Narration:** "Three panes. On the left, a spellbook editor with real cursed
  presets and an optional ritual directive. In the center, an interactive 3D
  ritual graph — drag to orbit, click a seal to inspect it. On the right, a
  grimoire terminal streaming the real analysis, with an isolated test sandbox.
  The header holds optional BYOK API sigils and a last-10 run history.
  Let's run an exorcism."

### `0:45 – 1:30` — Run the exorcism (the money shot)

- **On screen:** Type a short **RITUAL DIRECTIVE**, then click **EXORCISE
  CODE**. Let the full run play: Corrupted Code turns green, Spectral Scanner
  flashes crimson with a bug badge, the central relic heartbeat goes crimson,
  reasoning spins purple, then every seal and the aura resolve neon green. The
  terminal streams findings, fixes, and purified code. If a live key is
  configured, briefly show the live rewrite log and provider engine pill; if
  not, keep the deterministic run.
- **Narration:** "One click opens a real POST SSE stream. The server masks
  strings and comments, hunts syntax and logic corruption, applies only safe
  fixes, and streams every event back. The directive is passed through with the
  code; BYOK keys ride only in headers, and a failed live provider falls back to
  the builtin safety net. Watch the graph: the scanner goes crimson when real
  bugs are found, the aura follows the actual run state, and the purified output
  ends neon green. No fake progress — the 3D layer is reading the same events as
  the terminal."

### `1:30 – 2:00` — Unsafe findings, sandbox & history

- **On screen:** Load **Memory Leak**, run it, show the residual report and
  crimson scanner. Then load **Syntax Corruption** and show the unclosed-bracket
  findings. Switch to **SPECTRAL DIFF** to show every crimson removal and
  emerald addition, click **EXPORT REPORT**, then click **TEST SANDBOX** to show
  console/return output with the `LOCAL` badge. Change the runtime selector to
  **Python 3**, paste a three-line function, exorcise it, and click **TEST
  SANDBOX** again to show the `REMOTE` badge and real Python stdout. Open
  **HISTORY**, scroll the last entries, and click one to restore its code and
  result. Finish by toggling CRT/fog and clicking **COPY PURIFIED CODE**.
- **Narration:** "The engine is honest. A `setInterval` without cleanup and
  broken syntax are reported but never guessed at — they stay residual, and the
  scanner stays crimson. The spectral diff exposes every rewrite, the autopsy
  report exports the full evidence, and the sandbox runs JavaScript locally in an
  isolated worker with a two-second kill switch. Switch the runtime and the same
  button sends Python, Java, C++, or any of 28 non-JS runtimes through an
  allowlisted server proxy, then shows stdout, compile errors, and the exit code.
  The panel always tells you whether the run was local or remote. The history
  drawer keeps the last ten runs in this browser and restores one with a click."

### `2:00 – 2:35` — How Kiro built it

- **On screen:** Open `.kiro/specs/necrocode-exorcist/design.md`, then
  `.kiro/steering/3d-horror-rules.md`, then `.kiro/hooks/agent-execution.json`.
- **Narration:** "This is a Kiro-native project. We started with a Spec: the
  aura state machine, the WebGL component contracts, the SSE-to-node mapping,
  and acceptance criteria. A 3D Steering Doc locked the palette, performance
  rules, and SSR safety. Agent Hooks map every stage transition to a seal
  animation, aura, terminal effect, and synth blip. Kiro scaffolded the Next.js
  app, the analyzer, the SSE route, the React Three Fiber scene, and the audio
  engine from these artifacts."

### `2:35 – 3:00` — Close / call to action

- **On screen:** Finished run with all seals neon green and the giant relic
  breathing behind the glass. Resize to mobile to show the stacked layout.
- **Narration:** "Clone it, run it, deploy it to Vercel — zero config, keyless
  by default, and optionally supercharged with your own model key. NecroCode:
  where legacy code goes to be reborn. Happy Kiroween."

---

<div align="center">

**`« NecroCode — Kiroween 2026 »`**

</div>
