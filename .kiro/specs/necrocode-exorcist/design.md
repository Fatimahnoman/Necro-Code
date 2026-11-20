# Design Document — NecroCode Exorcist

Requirements: `#[[file:requirements.md]]`
Shared contract: `#[[file:../../../lib/types.ts]]`
Aura state machine: `#[[file:../../../lib/aura.ts]]`

## Overview

NecroCode is a Next.js 15 App Router application. One SSE route performs the
exorcism. A React 19 client renders a three-pane HUD with two React Three
Fiber canvases. The server owns analysis and the optional LLM rewrite. The
client owns visualization, audio, the sandbox, and browser-local persistence.

## Architecture

```text
Browser (React 19 client)                          Server (Node.js runtime)
┌────────────────────────────────────────┐        ┌───────────────────────────────┐
│ app/page.tsx  (HUD shell, orchestration)│       │ app/api/agent/stream/route.ts │
│  ├─ ControlPanel   (Spellbook)          │ POST  │  ├─ lib/analyzer.ts  (Heuristic)
│  ├─ AgentCanvas    (Ritual Graph pane)  │──────▶│  ├─ lib/liveEngine.ts (BYOK)   │
│  │   └─ three/ExecutionGraph3D (R3F)    │ SSE   │  └─ AgentEvent frames          │
│  ├─ Terminal       (Grimoire Terminal)  │◀──────│                               │
│  ├─ three/HorrorBackdrop (R3F, fixed)   │       │ app/api/run/route.ts          │
│  ├─ ApiSigilsModal / HistoryDrawer      │ POST  │  └─ lib/runner.ts → Paiza.IO   │
│  └─ hooks: useAgentStream, useCodeSandbox│─────▶│                               │
│     useHorrorAudio, useCyberSound,      │       └───────────────────────────────┘
│     useApiSigils, useGrimoireHistory,   │
│     useUiSettings                       │
└────────────────────────────────────────┘
```

### Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, route handlers) |
| UI | React 19, Tailwind CSS 3, Framer Motion 11, lucide-react |
| 3D | three 0.187, @react-three/fiber 9, @react-three/drei 10 |
| Language | TypeScript (`strict`) |
| Audio | HTML5 Audio (BGM) + Web Audio API (synthesized SFX) |

## SSE-to-3D state mapping

### Backend phases

The route emits five `AgentPhase` values (`lib/types.ts`). It emits them in
this order during a run:

| Phase | When the route emits it |
| --- | --- |
| `idle` | First "séance online" line |
| `thinking` | Artifact received, directive/warnings, Corrupted Code stage start |
| `tool_call` | Spectral Scanner invocation (`scan_for_corruption()`) |
| `executing` | Findings, reasoning, applied fixes, purified code lines |
| `complete` | Final event with `summary` and `finalCode` |

### Frontend ritual states

The UI has two separate mappings. Both come from code, not from the hooks.

**1. Phase label** (`PHASE_LABEL` in `ControlPanel.tsx`, `PHASE_META` in
`StatusPill.tsx`), one-to-one:

| Backend phase | UI label |
| --- | --- |
| `idle` | Dormant |
| `thinking` | Channelling |
| `tool_call` | Scanning |
| `executing` | Exorcising |
| `complete` | Purified |

**2. Relic aura** (`auraFromState(phase, bugCount, summary)` in `lib/aura.ts`):

| Condition | Aura | Label |
| --- | --- | --- |
| `phase === "idle"` | `idle` (`#7C3AED`) | DORMANT |
| running and `bugCount > 0` | `crimson` (`#FF003C`) | CORRUPTION |
| running and `bugCount === 0` | `purple` (`#A855F7`) | CHANNELLING |
| `complete` and `unresolved > 0` | `crimson` | CORRUPTION |
| `complete` and `unresolved === 0` | `green` (`#00FF66`) | PURIFIED |

The reverse direction (UI → backend) does not exist at runtime. The UI only
reads streamed events. The completed-run timeline maps its four buttons to
**stages**, not phases:

| Timeline step | Selects stage |
| --- | --- |
| `DORMANT` | `input_code` |
| `SCANNING` | `glitch_scanner` |
| `EXORCISING` | `exorcism_reasoning` |
| `PURIFIED` | `clean_code_output` |

### Seal status

Each seal reads `nodes[stageId]` from `useAgentStream`, which updates only from
streamed `nodeStatus` values:

| `NodeStatus` | Inspection label | Color |
| --- | --- | --- |
| `pending` | DORMANT | `#64748B` |
| `active` | CHANNELLING | purple aura |
| `done` | SEALED | green aura |
| `error` | CURSED | crimson aura |

The Spectral Scanner seal goes to `error` while findings stream and to `done`
after the reasoning stage clears them. No progress is fabricated on the client.

## Components and interfaces

### `AgentEvent` (shared, `lib/types.ts`)

```ts
interface AgentEvent {
  seq: number;
  phase: AgentPhase;            // idle | thinking | tool_call | executing | complete
  stage: StageId | null;        // input_code | glitch_scanner | exorcism_reasoning | clean_code_output
  nodeStatus: NodeStatus | null; // pending | active | done | error
  level: LogLevel;              // info | success | warn | error | system | code
  message: string;
  progress: number;             // 0..100
  ts: string;                   // ISO timestamp
  bug?: BugFinding;
  summary?: ExorcismSummary;    // final event
  finalCode?: string;           // final event
  originalCode?: string;        // final event
  findings?: BugFinding[];      // final event
  appliedFixes?: AppliedFix[];  // final event
  engine?: EngineInfo;          // Gemini | Groq | OpenRouter | Heuristic
}
```

### `AgentCanvas` (`components/AgentCanvas.tsx`)

```ts
interface AgentCanvasProps {
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  bugCount?: number;
  aura: AuraState;
  progress: number;
  running: boolean;
  phase: AgentPhase;
  summary: ExorcismSummary | null;
  logs: AgentEvent[];
  engine: EngineInfo;
  scanlines?: boolean;
}
```

- Dynamically imports `ExecutionGraph3D` with `ssr: false` and a rune-spinner fallback.
- Owns the selected stage, the inspection card (status, engine, stage duration in ms, severity counts), and the completed-run timeline.

### `ExecutionGraph3D` (`components/three/ExecutionGraph3D.tsx`)

- `Canvas` with camera `[0, 0.18, 7.2]`, `fov: 45`, `dpr: [1, 1.8]`, transparent clear color.
- Four seals, a central relic, Drei `Line` edges, and flowing orbs on the active edge.
- Graph scale adapts to aspect ratio: `min(1, max(0.55, 6.3 * aspect / 8.1))`.
- `OrbitControls` with `enablePan={false}` and `enableZoom={false}`; `onPointerMissed` clears selection.
- Stage labels are a DOM overlay projected from 3D anchors every frame (`text-[9.5px]`, `bg-black/75`, `backdrop-blur-md`, `whitespace-nowrap`).

### `HorrorBackdrop` (`components/three/HorrorBackdrop.tsx`)

- Fixed, `pointer-events-none`, transparent canvas with `dpr: [1, 1.6]`.
- 560 embers, 80 Drei `Sparkles`, a wireframe icosahedron relic tinted by the aura, pointer parallax.

### `ControlPanel` (`components/ControlPanel.tsx`)

- Cursed presets (`lib/cursedCode.ts`), file upload, runtime selector, ritual directive, line-numbered editor, progress bar, summary chips.
- `Exorcise Code` button (crimson glow, hover scale) and `Banish ritual` reset.

### `Terminal` (`components/Terminal.tsx`)

- Tabs: `Terminal` (color-coded log, `role="log"`) and `Spectral Diff` (unified diff with dual line gutters).
- Actions: copy, download (`purified-artifact.ts`), `GEN TEST`, `Test sandbox`, `Export report` (`necrocode-exorcism-report.md`).
- When `autoDemoNonce` changes and the run is complete, switches to the diff and starts the sandbox.

### Header (`app/page.tsx`)

- Brand `NECROCODE` (`text-xl font-extrabold tracking-[0.16em]`) with `// AI CODE EXORCIST`.
- Controls: `AUTO DEMO`, `API Sigils`, `History`, `Horror BGM`, `3D Audio FX`, CRT toggle, fog toggle, `StatusPill`.

## Fallback pipeline

1. Use the default cursed artifact if the input is empty, cap the artifact at 24,000 characters, and cap the directive at 500 characters.
2. If the language is JS/TS/TSX, run `exorciseCode()`. Otherwise build a pass-through report.
3. If sigils exist, call `tryLiveExorcism()`:
   - Providers in `API_SIGIL_META` order: Gemini → Groq → OpenRouter.
   - Each request uses an `AbortController` with an 8-second timeout, `temperature: 0.1`, and an 8,192-token output limit.
   - Output is accepted only if non-empty, under 160,000 chars, and code-like.
4. On success, the live code becomes `finalCode`. For JS/TS/TSX it is re-analyzed for residual findings.
5. On failure of every provider, the Heuristic result stands and the stream says so.

## Sandbox design

| Path | Languages | Limit | Module |
| --- | --- | --- | --- |
| Local Web Worker | JavaScript | 2 s, worker terminated | `lib/useCodeSandbox.ts` |
| Remote runner | 28 others (TypeScript, TSX, Python, Java, …) | 20 s server / 25 s client | `app/api/run/route.ts`, `lib/runner.ts` |

`PAIZA_API_BASE` and `PAIZA_API_KEY` are optional server-side env vars.

## Audio design

| Engine | Source | Behavior |
| --- | --- | --- |
| BGM (`lib/horrorAudio.ts`) | `public/audio/horror-bgm.mp3` | Loop; `0.22` idle, fades to `0.85` while running before the output stage; gesture unlock |
| SFX (`lib/useCyberSound.ts`) | Synthesized oscillators | `dhum` on run start; per-event effects from `lib/sfxMap.ts`; off by default |

## Error handling

- Invalid JSON body → defaults (`javascript`, empty directive, default cursed artifact).
- Unknown language id → `javascript`.
- Provider errors are swallowed per provider and fall through to the next.
- Client abort → silent stop.
- Remote runner errors and timeouts are shown as sandbox lines with status `error` or `timeout`.
- If WebGL fails, the dynamic loader fallback stays visible and the rest of the HUD keeps working.

## Testing strategy

- No automated test suite is committed.
- Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus the manual checklist in `README.md` (“How to Test the Running App”).
- `GEN TEST` is a runtime smoke check for purified artifacts, not a project test suite.
