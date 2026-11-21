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
│     useHorrorAudio, useCyberSound,      │       │ app/api/github/route.ts       │
│     useApiSigils, useGrimoireHistory,   │ POST  │  ├─ lib/github.ts (URL parse)  │
│     useUiSettings                       │──────▶│  └─ raw.githubusercontent.com │
└────────────────────────────────────────┘        └───────────────────────────────┘
```

Shared, side-effect-free helpers used on both sides: `lib/report.ts`
(`healthScore`, `buildUnifiedPatch`, `buildAutopsyReport`), `lib/diff.ts`,
`lib/github.ts`.

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
  summary?: ExorcismSummary;    // final event; includes optional healthBefore / healthAfter
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

- Cursed presets (`lib/cursedCode.ts`), `GitHub` summon toggle, file upload, runtime selector, ritual directive, line-numbered editor, progress bar, summary chips.
- The `GitHub` toggle opens a form (`#github-summon`). Submit validates with `parseGitHubFileUrl()` first, then calls `POST /api/github`, and on success calls `onCodeChange`, `onFilenameChange(path)`, and `onLanguageChange(language)` when the language is known.
- `Exorcise Code` button (crimson glow, hover scale) and `Banish ritual` reset.

### `Terminal` (`components/Terminal.tsx`)

- Tabs: `Terminal` (color-coded log, `role="log"`) and `Spectral Diff` (unified diff with dual line gutters).
- Actions: copy, download (`purified-artifact.ts`), `GEN TEST`, `Test sandbox`, `Export report` (`necrocode-exorcism-report.md`), `.patch` (`necrocode-fix.patch`).
- Header shows the health badge (`<before> → <after> /100`) when `summary.healthBefore` and `summary.healthAfter` exist.
- New prop: `filename: string` (editor filename or GitHub path) — the patch target path.
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

## GitHub summon design

```ts
// lib/github.ts
parseGitHubFileUrl(input: string):
  | { ok: true; file: { owner; repo; ref; path; filename; rawUrl } }
  | { ok: false; message: string };

// POST /api/github  body: { url: string }
type GitHubSummonResponse =
  | { ok: true; code; owner; repo; ref; path; filename; language: LanguageId | null; lines }
  | { ok: false; message };
```

| Step | Rule |
| --- | --- |
| Parse | Hosts `github.com`, `www.github.com`, `raw.githubusercontent.com` only; no credentials or port; `blob/` required for github.com; ref = first segment after `blob/`; reject `.`, `..`, encoded `/` or `\`, control chars. |
| Fetch | Server builds the raw URL itself; `redirect: "manual"`, max 2 redirects, each must stay on `https://raw.githubusercontent.com`; 8 s `AbortController` timeout. |
| Read | Stop at 96,000 bytes; reject NUL bytes (binary), invalid UTF-8, empty files, and > 24,000 chars (same cap as the SSE route, so a summoned file is never truncated). Strip a UTF-8 BOM. |
| Detect | `languageIdFromFilename(filename)`; `null` keeps the current runtime. |

Status codes: `400` invalid URL or body, `404` not found or private, `413` too
large, `415` binary or not UTF-8, `422` empty, `502` GitHub error or blocked
redirect, `504` timeout.

Known limit: a branch name containing `/` fetches correctly, but `path` then
includes the tail of the branch name, so the patch path needs editing.

## Health score design

```ts
HEALTH_WEIGHTS = { critical: 15, warning: 6, info: 2 };
healthScore(findings) = clamp(0, 100, 100 − Σ HEALTH_WEIGHTS[severity]);
healthTier(score) = score ≥ 80 ? "pure" : score ≥ 50 ? "haunted" : "cursed";
```

- The SSE route computes `healthBefore` from `baseReport.findings` and
  `healthAfter` from `remaining` (re-analyzed after a live rewrite), only for
  JS/TS/TSX. Both ride on the final `summary`, so history entries keep them.
- Measured on the bundled presets: `haunted-loop` 46 → 100,
  `async-memory-leak` (AUTO DEMO) 73 → 100, `tainted-secret` 56 → 85,
  `syntax-corruption` 55 → 55.

## Patch design

`buildUnifiedPatch(original, purified, path): string | null` in `lib/report.ts`.

1. Normalize CRLF to LF and split each side into lines plus a
   trailing-newline flag. The purified side takes the original's flag.
2. Diff with `diffLines()`. A shared last line whose newline differs becomes a
   `-`/`+` pair.
3. Group changes into hunks with 3 context lines; merge overlapping hunks.
   Zero-length sides use the preceding line number (`@@ -0,0 +1,3 @@`).
4. Emit `diff --git a/<path> b/<path>`, `--- a/<path>`, `+++ b/<path>`, hunks,
   and `\ No newline at end of file` after the affected last line.
5. Return `null` when nothing changed (button disabled).

`patchPath(name, ext)` converts `\` to `/`, drops empty and `.` segments, and
falls back to `artifact.<ext>` for `..` or control characters.

Known limits: the patch targets LF files (CRLF files need
`git apply --ignore-whitespace` or LF checkout); artifacts over 24,000 chars
are truncated by the SSE route, so their patch may not apply (GitHub summons
reject such files up front).

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
- The GitHub parser, `/api/github` (with a mocked `fetch`), `healthScore`, and
  `buildUnifiedPatch` were checked with a throwaway script: 400 generated and
  preset patches were applied with real `git apply` and matched the expected
  file byte for byte. The script is not committed (see task 12).
- Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus the manual checklist in `README.md` (“How to Test the Running App”).
- `GEN TEST` is a runtime smoke check for purified artifacts, not a project test suite.
