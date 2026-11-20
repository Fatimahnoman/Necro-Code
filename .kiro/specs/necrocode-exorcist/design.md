# Design — NecroCode Exorcist

Status: **Implemented**
Owner: NecroCode
Track: Kiroween 2026 · Costume Contest

## 1. Overview

NecroCode is a premium 3D horror cyber-gothic AI code exorcist studio. The
product turns a user-supplied source artifact into a real exorcism: a
deterministic static analyzer hunts corruption, an optional BYOK live engine
attempts a rewrite, and the SSE stream drives a synchronized 3D ritual graph,
terminal, progress, aura, adaptive horror BGM, synthesized SFX, and final
artifact delivery.

## 2. System architecture

### 2.0 Architecture diagram

```text
┌─────────────────────┐
│        Client        │
│  Next.js 15 App      │
│  - app/page.tsx      │
│  - components/*      │
│  - components/three/ │
│  - lib/useAgentStream│
└──────────┬──────────┘
           │ POST /api/agent/stream (SSE; x-necro-*-key headers)
           ▼
┌─────────────────────┐
│   API Route          │
│   app/api/.../stream│
│   - analyzer.ts       │
│   - liveEngine.ts    │
│   - AgentEvent frames│
└──────────┬──────────┘
           │ event: agent
           ▼
┌─────────────────────┐
│  React Three Fiber  │
│  ExecutionGraph3D +  │
│  AgentCanvas        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  UI panes:           │
│  ControlPanel,       │
│  Terminal, Backdrop │
└─────────────────────┘
```

### 2.1 Client layer

- `app/page.tsx` composes the three-pane HUD and orchestrates state through
  focused hooks.
- `components/ControlPanel.tsx` owns the spellbook: presets, upload, directive,
  line-numbered editor, progress, summary chips, and `EXORCISE CODE`.
- `components/AgentCanvas.tsx` owns the 3D canvas wrapper, inspection card,
  duration telemetry, and the `SSE ↔ 3D SYNC` indicator.
- `components/three/ExecutionGraph3D.tsx` owns seals, screen-space labels,
  central relic, edges, and flowing orbs.
- `components/three/HorrorBackdrop.tsx` owns atmosphere, embers, fog, and relic.
- `components/Terminal.tsx` owns logs, spectral diff, sandbox controls,
  export, and copy.
- Supporting components: `StatusPill`, `NeonButton`, `ToggleButton`,
  `HistoryDrawer`, and `ApiSigilsModal`.

### 2.2 Server layer

- `app/api/agent/stream/route.ts` exposes `POST /api/agent/stream` and
  `GET /api/agent/stream?code=…`, streams `text/event-stream` frames named
  `agent`.
- `app/api/run/route.ts` proxies curated remote sandbox executions through the
  Paiza.IO guest runner.

### 2.3 Shared contract

- `lib/types.ts` is the single source of truth for `AgentPhase`,
  `StageId`, `NodeStatus`, `LogLevel`, `AgentEvent`, `ExorcismReport`, and
  `WORKFLOW_STAGES`.

### 2.4 Dashboard layout and typography

- Desktop dashboard grid uses three equal columns:
  `repeat(3, minmax(0, 1fr))` with `gap-3.5`; stacked on mobile.
- Flush equal-height panel symmetry: the grid uses `items-stretch` and a
  `flex-1 min-h-0` middle region; panel roots use `h-full min-h-0 flex
  flex-col justify-between rounded-2xl`; the center graph area uses
  `min-h-0 flex-1`; side panels fill their full height without bottom gaps.
- Brand title: `NECROCODE` uses `text-xl font-extrabold tracking-[0.16em] text-white`.
- Panel headings: `SPELLBOOK`, `RITUAL GRAPH`, and `GRIMOIRE TERMINAL` share
  `text-xs font-bold uppercase tracking-[0.15em]`.
- Body/code text: `11px–12px`; labels/badges: `10px`.
- Header pill fit: top status pills use `text-[9.5px] px-2.5 py-1 gap-1.5` and
  must fit without right-edge clipping.

## 2.5 Final judge polish

### 2.5.1 One-click judge auto demo

- The header exposes a compact `AUTO DEMO` control in the top status bar.
- Activation loads a curated multi-bug async/memory-leak artifact into the
  spellbook editor, sets a ritual directive, and starts the full exorcism.
- The run fires the `DHUM!` FX and synchronizes the 3D Ritual Graph and unified
  side-by-side Spectral Diff with streamed events.
- The isolated sandbox test runs automatically once the purified artifact is
  emitted, so a judge can experience the complete workflow from one click.

### 2.5.2 Completed-exorcism timeline scrubber

- Once the frontend phase reaches `complete`, the Ritual Graph panel renders a
  compact four-step timeline scrubber.
- Steps: `DORMANT` → `SCANNING` → `EXORCISING` → `PURIFIED`.
- Buttons inspect and replay the corresponding 3D orb transitions.

### 2.5.3 Purified artifact unit test

- The Grimoire Terminal action bar exposes a compact `GEN TEST` control.
- Activation generates a lightweight assertion suite for the purified function.
- The suite executes in the isolated Web Worker sandbox and reports clean
  `PASS` / `FAIL` badges.

## 3. SSE-to-3D state mapping

The backend SSE phase and the frontend 3D Ritual Graph UI state are explicitly
bidirectionally aligned.

| Backend SSE phase | Frontend Ritual UI state |
| --- | --- |
| `idle` | `dormant` |
| `thinking` | `dormant` |
| `tool_call` | `scanning` |
| `executing` | `exorcising` |
| `complete` | `purified` |

Reverse mapping:

| Frontend Ritual UI state | Backend SSE phase |
| --- | --- |
| `dormant` | `idle` |
| `scanning` | `tool_call` |
| `exorcising` | `executing` |
| `purified` | `complete` |

The 3D seals derive from real `nodeStatus` events; no fake progress is rendered.
The central relic aura derives from `lib/aura.ts` and follows the aggregate run
state.

## 4. Component contracts

### `ExecutionGraph3D`

```ts
interface ExecutionGraph3DProps {
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  bugCount: number;
  aura: AuraState;
  selected: StageId | null;
  onSelect: (stage: StageId) => void;
  onClear: () => void;
}
```

Responsibilities:

- Render four seals in ritual-square positions.
- Project screen-space labels from 3D node anchors every frame.
- Keep labels accessible and readable: `font-mono uppercase tracking-wider border
  backdrop-blur`; base `9.5px`, responsive `10px`. Compact single-line HUD tags use
  `text-[9.5px] leading-none tracking-[0.14em] px-2 py-1 whitespace-nowrap rounded
  bg-black/75 border border-white/15 backdrop-blur-md`; the graph scale is tuned to
  `~0.78` with camera `[0, 0.18, 7.2]` and fov `45` for a clean single-viewport fit, and
  the inspection HUD keeps clean `pb-3` padding.
- Render the bug badge, flowing edge orbs, and central relic.
- Orbit only; no pan or zoom; click empty space clears selection.

### `AgentCanvas`

- Accepts stream state, aura, progress, summary, logs, and engine.
- Dynamically imports `ExecutionGraph3D` with `ssr: false`.
- Owns selection state and inspection card.

## 5. Fallback pipeline

1. Deterministic analyzer runs first for JavaScript, TypeScript, and TSX.
2. If BYOK sigils are configured, the live engine attempts Gemini → Groq →
   OpenRouter in order, with an 8-second timeout per provider.
3. If a live rewrite returns usable code, it becomes `finalCode` and the result
   is re-analyzed for residual findings.
4. If all live attempts fail, the deterministic `Heuristic` engine remains the
   safety net.
5. For non-JS/TS/TSX runtimes, the deterministic scanner is intentionally not
   applied; the route emits an honest pass-through warning and relies on the live
   engine or sandbox verification.

BYOK keys are transported through dedicated headers (`x-necro-gemini-key`,
`x-necro-groq-key`, `x-necro-openrouter-key`) and never enter request bodies or
SSE payloads.

## 6. Limits and safety

- Source cap: 24,000 characters.
- Provider timeout: 8 seconds.
- Remote sandbox server deadline: 20 seconds; client deadline: 25 seconds.
- Stream logs and fixes are capped; full artifact is delivered via `finalCode`.
- Abortable fetch stream; quiet disconnect handling.

## 7. Acceptance criteria

- [x] SSE and 3D phases map through an explicit bidirectional contract.
- [x] Live fallback pipeline ends at the deterministic engine.
- [x] 3D labels remain readable at the finalized typography.
- [x] Remote and local sandbox boundaries are enforced.
- [x] Judge one-click `AUTO DEMO` completes the full workflow.
- [x] Completed-exorcism timeline scrubber supports replay.
- [x] Purified artifact unit test reports clean `PASS` / `FAIL` results.
