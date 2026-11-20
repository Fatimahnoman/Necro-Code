# Spec — Code Exorcist 3D Studio

Status: **Implemented**
Owner: NecroCode
Track: Kiroween 2026 · Costume Contest
Related steering:

- `#[[file:../../steering/3d-horror-rules.md]]`
- `#[[file:../../steering/horror-rules.md]]`

Shared contract: `#[[file:../../../lib/types.ts]]`
Aura state: `#[[file:../../../lib/aura.ts]]`
Engine: `#[[file:../../../lib/analyzer.ts]]`
Cursed samples: `#[[file:../../../lib/cursedCode.ts]]`

## 1. Overview

NecroCode is a premium 3D horror cyber-gothic AI code exorcist studio. The user
offers a real JavaScript/TypeScript artifact (preset, paste, or upload). A
POST SSE stream runs the deterministic server-side analyzer, streams every real
finding and every safe counter-sigil, then streams the purified artifact.

The 3D WebGL layer is the primary stage. It is synchronized to the same SSE
events that drive the terminal and the progress bar:

```text
Corrupted Code → Spectral Scanner → Kiro Exorcism Reasoning → Purified Output
```

No external LLM, API key, model, or 3D asset is used. The horror BGM is bundled
locally; SFX are synthesized.

## 2. Dashboard layout

### Header

- Emblem: rotating rune circle + skull.
- Title: `NECROCODE // AI CODE EXORCIST` with a flicker glow.
- Kiroween 2026 badge.
- Live neon pills: agent phase, `SSE LIVE`, aggregate 3D aura.
- `HORROR BGM` toggle (looped `/audio/horror-bgm.mp3`, independent of 3D FX).
- `3D AUDIO FX` toggle (stereo-panned Web Audio oscillators, including the
  `EXORCISE CODE` DHUM slam).
- Icon-only CRT scanline toggle and eerie fog toggle.

### Left sidebar — Spellbook Code Editor

- Cursed template selector with real presets, including:
  `Infinite Loop`, `Memory Leak`, `Syntax Corruption`.
- Upload button for `.js/.jsx/.ts/.tsx/.mjs/.cjs/.txt`.
- Line-numbered editor with synced gutter scroll.
- Lines/chars metadata.
- Phase + progress bar.
- Corruption report chips: `cursed / silenced / residual`.
- Primary glowing `EXORCISE CODE` button with a blood-pulse hover.
- Secondary `Banish ritual` reset.

### Center viewport — Interactive 3D Ritual Graph

- A dedicated React Three Fiber canvas, client-only.
- Four 3D seals connected by glowing lines.
- A central polyhedron/skull relic with eye sockets, glowing pupils, rotating
  rings, and a point light.
- Flowing orbs travel along the currently active edge.
- The relic aura is crimson while bugs are present, purple while channeling,
  and neon green when the artifact is purified.
- Drag to orbit; click a seal to inspect its status and description.
- The scanner seal shows a bug-count badge when corruption is found.

### Right sidebar — Grimoire Terminal

- High-tech translucent terminal.
- Real SSE logs with color-coded levels: system, info, success, warn, error,
  code.
- Auto-scroll, blinking blood cursor while streaming.
- Compact corruption report.
- One-click `COPY PURIFIED CODE` button; download icon in the header.
- The full `finalCode` is always available even when stream rendering is
  truncated.

## 3. Aura state machine

```ts
type AuraState = "idle" | "crimson" | "purple" | "green";

auraFromState(phase, bugCount, summary):
  idle                         → "idle"
  complete + unresolved > 0    → "crimson"
  complete + unresolved === 0  → "green"
  running + bugCount > 0       → "crimson"
  running + bugCount === 0     → "purple"
```

| State | Hex | Visual |
| --- | --- | --- |
| `idle` | `#7C3AED` | slow dormant breathing |
| `crimson` | `#FF003C` | fast heartbeat, red point light, corruption aura |
| `purple` | `#A855F7` | channeling spin, purple rings |
| `green` | `#00FF66` | purified glow, green point light |

The central relic lerps toward the target color; it never snaps between states.

## 4. SSE event contract

Endpoint: `POST /api/agent/stream` with `{ "code": string }`.
Transport: `event: agent\ndata: <JSON>\n\n`.

```ts
interface AgentEvent {
  seq: number;
  phase: "idle" | "thinking" | "tool_call" | "executing" | "complete";
  stage: StageId | null;
  nodeStatus: "pending" | "active" | "done" | "error" | null;
  level: "info" | "success" | "warn" | "error" | "system" | "code";
  message: string;
  progress: number;
  ts: string;
  bug?: BugFinding;
  summary?: ExorcismSummary;
  finalCode?: string;
}
```

Stage IDs and 3D labels:

| Stage ID | 3D label |
| --- | --- |
| `input_code` | Corrupted Code |
| `glitch_scanner` | Spectral Scanner |
| `exorcism_reasoning` | Kiro Exorcism Reasoning |
| `clean_code_output` | Purified Output |

The route emits `nodeStatus` per stage; the client reducer updates the 3D seals.
The server does not know about WebGL and never fakes visual progress.

## 5. Analysis engine

Deterministic and dependency-free:

- Mask strings/templates/comments while preserving offsets.
- Syntax seal: unterminated strings, stray/mismatched/unclosed brackets.
- Rules: loose equality, `var`, `debugger`, `eval`, radix-less `parseInt`,
  off-by-one `.length` loops, assignment in `if`, empty `catch`, thrown string,
  leaked secret, `innerHTML`, `document.write`, `with`, `alert`, `NaN`
  comparison, unresolved interval (memory leak), TODO/FIXME, console residue.
- Safe fixes only. Unsafe findings (`eval`, `document.write`, `with`, `alert`,
  syntax, undying interval) remain unresolved and are counted.
- Input capped at 24,000 chars.
- Findings/fix logs capped at 18 each; streamed code lines capped at 260.

## 6. 3D component contracts

### `HorrorBackdrop`

```ts
interface HorrorBackdropProps {
  aura: AuraState;
}
```

- Fixed `z-0` canvas, transparent clear color.
- 560 additive embers, pointer-parallax, sparkles.
- Giant wireframe relic with color lerp and emissive breathing.

### `ExecutionGraph3D`

```ts
interface ExecutionGraph3DProps {
  nodes: Record<StageId, NodeStatus>;
  activeStage: StageId | null;
  bugCount: number;
  aura: AuraState;
  selected: StageId | null;
  onSelect: (stage: StageId) => void;
  onClear: () => void;
}
```

- `Canvas` with `alpha: true`, capped DPR, no SSR.
- Orbit rotation only.
- Four seals + central relic + flowing edge orbs.
- Screen-space DOM labels projected from 3D node anchors every frame, with
  `pointer-events: none` and canvas-aware sizing (no Drei `Html` portals).
- `lib/three-runtime.ts` filters only R3F's upstream `THREE.Clock` deprecation
  advisory; every other three.js warning and error passes through.

### `AgentCanvas`

Owns the selected-stage inspection card, aura pill, bug count, and the
`SSE ↔ 3D SYNC` indicator. It dynamically imports `ExecutionGraph3D`.

## 7. Acceptance criteria

- [x] Full-screen 3D backdrop with procedural fog/embers and a giant relic.
- [x] Independent 3D execution graph with four labeled seals.
- [x] Central skull/polyhedron pulses crimson when bugs are present.
- [x] Aura shifts to purple while reasoning and neon green when purified.
- [x] Real SSE `nodeStatus` events drive seal transitions.
- [x] Scanner seal displays a live bug-count badge.
- [x] Clicking a seal opens an inspection card; clicking empty space clears it.
- [x] Dev and production consoles are free of React root-unmount errors and the
  upstream R3F `THREE.Clock` advisory.
- [x] Drag orbits the graph without hijacking page scroll.
- [x] Left sidebar contains presets including Infinite Loop, Memory Leak, and
      Syntax Corruption.
- [x] `EXORCISE CODE` has a blood-pulse hover and starts a real POST SSE run.
- [x] Terminal streams real logs and copies the full purified artifact.
- [x] `HORROR BGM` starts at `0.22` when autoplay is allowed (otherwise on the
      first page gesture), surges to `0.85` during scanning/reasoning, and
      returns to `0.22` when purified; it toggles independently of `3D AUDIO FX`.
- [x] Stereo-panned `3D AUDIO FX` toggle works with synthesized SFX only,
      including the `EXORCISE CODE` DHUM slam.
- [x] CRT scanlines, fog, vignette, rune borders, and glassmorphism are
      toggleable/visible.
- [x] `next build` completes with zero TypeScript/ESLint errors.
- [x] No environment variables required; deployable to Vercel.

## 8. Performance & safety

- Client-only R3F imports; no `window`/`document` access during SSR.
- Low-poly geometry, capped DPR, no post-processing passes.
- Additive transparent materials use `depthWrite={false}`.
- Terminal output bounded; full artifact delivered in `finalCode`.
- Abortable fetch stream; reset is safe; disconnect closes quietly.
- The user's snippet never leaves their own server request; no third-party
  calls.
