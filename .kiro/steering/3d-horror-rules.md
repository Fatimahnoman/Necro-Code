# NecroCode — 3D Horror Rules & WebGL Covenant

> Authoritative steering for the premium 3D horror layer.
> If a visual decision conflicts with this file, this file wins.

## Mission

NecroCode is a **high-end 3D horror cyber-gothic AI code exorcist studio** for
Kiroween 2026 (Costume Contest). The 3D layer is not decoration bolted onto a
form: it is the ritual altar. Every SSE stage transition must be visible in the
WebGL scene, and every WebGL interaction must map back to the real exorcism
state.

## Locked 3D palette

| Token | Hex | Role |
| --- | --- | --- |
| `void` | `#06060c` | Page background, WebGL clear color (alpha 0), relic sockets |
| `crimson` | `#FF003C` | Processing bugs, corruption aura, error seals |
| `purple` | `#A855F7` | Channeling, reasoning, interactive hover |
| `neon` | `#00FF66` | Exorcised code, purified aura, completed seals |
| `bone` | `#E5E7EB` | HTML labels and UI text over the canvas |

The 3D Aura state machine is the single source of truth:

```ts
type AuraState = "idle" | "crimson" | "purple" | "green";
```

- `idle` → dormant purple, slow breathing.
- `crimson` → at least one real bug is present, or unresolved findings remain.
  Fast heartbeat pulse on the central relic.
- `purple` → an exorcism is running and no bug has been surfaced yet.
- `green` → the ritual completed with zero unresolved findings.

`auraFromState(phase, bugCount, summary)` in `lib/aura.ts` computes the state.
Never hard-code a second aura computation inside a component.

## Scene architecture

Two dedicated, dynamically imported client-only canvases:

1. **`components/three/HorrorBackdrop.tsx`** — fixed full-screen atmosphere.
   - `Canvas` is `ssr: false` and transparent (`alpha: true`, clear alpha 0).
   - 560 additive spectral embers, pointer-parallax fog drift, `Sparkles`.
   - One giant wireframe icosahedron relic behind the dashboard; it rotates,
     breathes, and lerps its emissive color toward the current aura.
   - The canvas is `pointer-events-none` at `z-0` so it never blocks page
     scroll or panel clicks. Parallax reads a window-level `pointermove`
     listener, so it still reacts even though the glass HUD sits above it.
2. **`components/three/ExecutionGraph3D.tsx`** — the center ritual graph.
   - Four 3D seals at the corners of a ritual square:
     `Corrupted Code → Spectral Scanner → Kiro Exorcism Reasoning → Purified Output`.
   - A central polyhedron/skull relic with sockets, glowing pupils, rotating
     rings, and a point light.
   - Connected by Drei `Line` segments with flowing orbs on the active edge.
   - `OrbitControls` allows rotation only: no pan, no zoom. This keeps page
     scroll predictable and the graph readable.
   - Clicking a seal selects it and raises an HTML inspection card.
   - `onPointerMissed` clears the selection.

## Performance rules

- Every canvas is client-only: `dynamic(() => import(...), { ssr: false })`.
- Keep `dpr` capped: backdrop `[1, 1.6]`, graph `[1, 1.8]`.
- Geometry must stay low-poly: icosahedron detail ≤ 1, dodecahedron detail 0.
- No per-frame allocations of colors/vectors where avoidable; reuse refs and
  memoized `THREE.Color` / `THREE.Vector3` values.
- No external 3D models, textures, or HDRIs. The only bundled audio asset is
  `public/audio/horror-bgm.mp3`; SFX and 3D visuals are procedural, so
  `npm install && npm run build` stays Vercel-safe.
- No `<Suspense>` fallback that blocks the whole dashboard; the graph itself
  owns its loader.

## SSR / runtime rules

- `@react-three/fiber` and `@react-three/drei` must never be evaluated on the
  server. Import only through `next/dynamic` with `ssr: false` from a client
  component.
- Always call `gl.setClearColor(0x000000, 0)` in `onCreated` so the CSS fog,
  vignette, and grid remain visible through the canvas.
- Transparent materials set `depthWrite={false}` when they are additive or
  decorative.
- Dispose/cleanup DOM cursor changes in `useEffect` returns.

## Screen-space labels over WebGL

- Render stage labels as a DOM overlay outside `<Canvas>`; project each label
  from a 3D node anchor with `localToWorld(...).project(camera)` every frame.
  This avoids React 19's synchronous-root-unmount warning from Drei `Html`.
- The overlay is `pointer-events: none` so labels never steal orbit or seal
  clicks. Use `will-change: transform` and direct style writes, not state.
- Labels are clamped inside the canvas every frame using their measured
  width (`EDGE_GAP_PX` = 8), however the graph is orbited.
- Labels are HUD tags: `font-mono text-[12px] font-medium uppercase
  leading-tight tracking-[0.08em] px-2 py-1 rounded-md bg-[#0a0b14]/90 border
  backdrop-blur-md text-zinc-200`, `w-max max-w-[var(--label-max,176px)]`
  (`labelMaxPx()` = 30% of canvas width, 112–176px). Long names may wrap to
  two lines. No solid white cards.
- Camera is `[0, 0.18, 6.0]` with `fov: 45`. Seals sit at `(±2.75, ±1.58)`
  (`ORBIT_X`, `ORBIT_Y`), farther from the relic than before.
- Graph scale comes from `fitGraph(width, height, reserveTopPx,
  reserveBottomPx)`: the largest scale up to `1.15` (floor `0.4`) that keeps
  the seals (width) and seals + labels + both HUD strips (height) inside the
  canvas, plus a vertical offset that centres the graph between the strips.
  `AgentCanvas` reserves 72px on top and, at the bottom, 104px with the
  timeline, 64px with the first-run helper, 44px otherwise, so the
  `Purified Output` label never overlaps the footer.
- The seal inspection card sits above the footer (`bottom-[108px]` with the
  timeline, `bottom-14` otherwise).
- Central relic: additive outer wireframe, back-face rim shell (pulsing
  opacity), inner counter-rotating wireframe lattice, crisp dodecahedron
  edge lines, and two rim point lights behind it (aura color + `AURA_HEX.purple`).
  All geometry stays at icosahedron detail ≤ 1.

## Interaction contract

| Action | Result |
| --- | --- |
| Drag in the center viewport | Orbit the ritual graph |
| Click a 3D seal | Select stage + show inspection card |
| Click empty graph space | Clear selection |
| Hover a seal | Scale up, cursor pointer, stronger glow |
| Click `Exorcise Code` in the left spellbook | Start real SSE run (plays `dhum` if 3D Audio FX is on) |
| Hover `Exorcise Code` | Crimson glow brightens, slight scale-up |
| Click `AUTO DEMO` in the header | Load `async-memory-leak`, run, then open Spectral Diff and run the sandbox |
| Click a timeline step (after `complete`) | Select that stage's seal and show its inspection card |
| `FX & Audio` → `Horror BGM` | Looped `/audio/horror-bgm.mp3` only; never mutes 3D FX |
| `FX & Audio` → `3D Audio FX` | Stereo-panned oscillator SFX (incl. `dhum`) only; never silences BGM |
| `FX & Audio` → `CRT` / `Fog` | CSS atmosphere layers only |

## Stage → visual mapping

| Stage ID | 3D label | Active look | Done look | Error look |
| --- | --- | --- | --- | --- |
| `input_code` | Corrupted Code | purple seal spin | neon green | crimson |
| `glitch_scanner` | Spectral Scanner | purple scan + bug badge | neon green | crimson + heartbeat |
| `exorcism_reasoning` | Kiro Exorcism Reasoning | purple ring spin | neon green | crimson |
| `clean_code_output` | Purified Output | purple transcription | neon green | crimson |

The central relic always tracks the aggregate aura, not the selected node.
Selecting a node only changes the HTML inspection card and its ring highlight.

## Accessibility & resilience

- The 3D graph is progressive enhancement: the left progress bar, status pills,
  and terminal logs remain the accessible source of truth.
- Buttons are real `<button>` elements with `aria-label` / `aria-pressed`.
- The terminal keeps `role="log"` and `aria-live="polite"`.
- If WebGL fails or is unavailable, the dashboard must still function; the
  dynamic loader falls back to a rune spinner and the rest of the UI continues.
- `prefers-reduced-motion` is not allowed to break the app; keep CSS animations
  subtle and avoid scroll-jacking.

## Non-negotiables

- No fake 3D progress. Seal statuses come from real SSE `nodeStatus` events.
- No second color system. Use `AURA_HEX` and the Tailwind tokens.
- No heavy post-processing passes (bloom/DOF) in v1; emissive + additive
  blending + CSS vignette provide the cinematic look.
- No `any`, no untyped public component APIs.
- `npm run build` must pass with zero errors before shipping.
