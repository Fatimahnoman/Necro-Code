# Spec — Code Exorcist

Status: **Implemented**
Owner: NecroCode
Related steering: `#[[file:../../steering/horror-rules.md]]`
3D steering: `#[[file:../../steering/3d-horror-rules.md]]`
3D spec: `#[[file:code-exorcist-3d.md]]`
Shared contract: `#[[file:../../../lib/types.ts]]`
Engine: `#[[file:../../../lib/analyzer.ts]]`
Cursed samples: `#[[file:../../../lib/cursedCode.ts]]`

## 1. Overview

The user supplies a JS/TS artifact (preset, paste, or upload). The HUD opens a
POST SSE stream to `app/api/agent/stream/route.ts`. The route runs the static
exorcism engine over the real snippet, streams corruption findings, streams the
counter-sigils it applies, then streams the purified code. No external model or
API key is involved.

## 2. Ritual stages

| # | Stage ID | Label | Behaviour |
| --- | --- | --- | --- |
| 1 | `input_code` | Corrupted Code | Normalize + bound the artifact, mask strings/comments. |
| 2 | `glitch_scanner` | Spectral Scanner | Syntax seal + corruption rules. Node turns `error` (crimson pulse) when bugs exist. |
| 3 | `exorcism_reasoning` | Kiro Exorcism Reasoning | Apply deterministic fixes; stream each counter-sigil. |
| 4 | `clean_code_output` | Purified Output | Stream purified code lines, emit full `finalCode`. |

Node lifecycle: `pending → active → done` or `active → error` for the scanner.
On completion all seals are `done`; the scanner stays `error` if unresolved
findings remain.

## 3. Event contract (SSE)

Event name: `agent`. JSON payload:

```ts
interface AgentEvent {
  seq: number;
  phase: "idle" | "thinking" | "tool_call" | "executing" | "complete";
  stage: StageId | null;
  nodeStatus: "pending" | "active" | "done" | "error" | null;
  level: "info" | "success" | "warn" | "error" | "system" | "code";
  message: string;
  progress: number;          // 0..100
  ts: string;                // ISO
  bug?: BugFinding;          // on scanner findings
  summary?: ExorcismSummary; // on complete
  finalCode?: string;        // on complete (full artifact)
}
```

Transport: `event: agent\ndata: …\n\n`, `text/event-stream`, no caching,
`X-Accel-Buffering: no`.

## 4. Analysis engine

Deterministic, dependency-free. Input capped at 24,000 chars.

- **Masking:** strings/templates/comments replaced with spaces (offsets kept);
  comments-only mask for string-aware rules.
- **Syntax seal:** unterminated string, stray closer, mismatched bracket,
  unclosed bracket. Unclosed `{` blocks are sealed at the end of the snippet.
- **Corruption rules:** loose equality, `var`, `debugger`, `eval`, radix-less
  `parseInt`, `<= .length` off-by-one, unbounded `while (true)` / `while (1)`,
  assignment in `if`, empty `catch`, thrown string, leaked secret, `innerHTML`,
  `document.write`, `with`, `alert`, `NaN` comparison, TODO/FIXME, console
  residue.
- **Safe fixes:** `==`/`!=` → strict (skipping nullish checks), `var` → `let`,
  remove `debugger`, add `parseInt(...,10)`, `<` for `.length`, bound
  `while (true)` with a 1000-iteration `for` loop, `===` in conditions, log empty
  catches, `throw new Error`, blank leaked secrets, `textContent`,
  `Number.isNaN(...)`, comment standalone console calls, seal unclosed `{`
  blocks.
- **Unsafe findings** (`eval`, `document.write`, `with`, `alert`, unterminated
  strings, unclosed `(` / `[`) are reported but not rewritten.

Report: `findings`, `appliedFixes`, `remaining`, `summary`.

## 5. UI behaviour

- **Left:** cursed template selector (including Infinite Loop, Memory Leak,
  Syntax Corruption), upload, line-numbered editor, progress, summary chips,
  glowing `EXORCISE CODE` button.
- **Center:** interactive 3D ritual graph (`ExecutionGraph3D`). Four 3D seals in
  a ritual square around a central polyhedron/skull relic. Clicking a seal
  inspects it; dragging orbits.
  - detected bug → scanner seal **crimson** with a bug-count badge and a fast
    central relic heartbeat.
  - channeling/reasoning → **purple** aura and spinning rings.
  - fixed/complete → **neon green** aura and completed seals.
- **Right:** cyber-gothic terminal streams color-coded logs; generated code
  glows purple. One-click copy and download return the full `finalCode` even
  when the terminal stream is truncated. Footer shows detected/fixed/residual.
- **Backdrop:** fixed full-screen WebGL fog, embers, and a giant wireframe
  relic that reacts to the same aura.

## 6. Performance & safety

- Max 18 finding logs, 18 fix logs, 260 streamed code lines.
- Full artifact still delivered in `finalCode`.
- Abortable fetch stream; resets are safe; disconnect closes quietly.
- No secrets leave the browser except the user’s own pasted snippet.

## 7. Acceptance criteria

- [x] Pasting/uploading real JS/TS produces real findings from the snippet.
- [x] Scanner node pulses red when at least one bug is detected.
- [x] Safe fixes are applied and the purified code is streamed + copyable.
- [x] Infinite `while (true)` loops are bounded and unclosed `{` blocks are sealed.
- [x] Unresolved findings keep the scanner red and are counted.
- [x] All four seals transition in order and progress reaches 100%.
- [x] Re-running resets nodes/logs cleanly.
- [x] `npm run build` completes with zero TypeScript/ESLint errors.
- [x] Deploys to Vercel with no env vars.

## 8. Visual polish

Pitch-black void, drifting fog, rune borders with corner glyphs, flickering CRT
scanlines, glassmorphism, floating seals, neon trails, blood pulse, ectoplasm
completion glow, synthesized Web Audio blips (off by default), and the bundled
`/audio/horror-bgm.mp3` loop (on by default at `0.22`, surging to `0.85` during
scanning/reasoning, unlocked on first gesture when autoplay is blocked).
