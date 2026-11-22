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
| `purple` | `#9D4EDD` | Eldritch amethyst: channeling, reasoning, active seals |
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

## Cathedral ritual altar

- **Skull** (`SkeletonSkull`): a procedural possessed demon skull. Cranium,
  heavy brow ridge, swept-back horns, maxilla, sharp cheekbones, deep black
  sockets with pinpoint pupils (blood `#FF0A2A`; necrotic `#00FF66` once
  purified), an inverted-triangle nasal cavity, teeth with two fangs, and a
  hinged jaw. Harsh blood under-light from below (`[0,-1.25,0.75]`, ~15,
  flickering) with only a faint front fill, so the face reads in sinister
  relief; it turns necrotic green when purified. No shadow maps (cost).
  `RELIC_SCALE = 1.35`, `SKULL_Y = 0.2`.
  - **Gaze:** `useGaze()` tracks the pointer on `window`, normalized to the
    canvas rect (clamped ±1.6). The pupils shift up to `GAZE_RANGE` inside
    the sockets and the head turns toward the cursor (eased).
  - **Roar** on a run's rising edge (`ROAR_SECONDS = 1.5`): jaw gapes, violent
    shudder, eye/under-light surge. Chatter while running.
  - **Burn** on a purified finish (`BURN_SECONDS = 2.4`): crimson burns away
    into a blinding necrotic-emerald flare (expanding additive shell, 40→0
    light spike, bone emissive). Roar shudder and flare skip under reduced
    motion. `AgentCanvas` adds a matching DOM flash over the panel (emerald
    when purified, crimson pulse when residual).
- **Fire** (`SkullFire`): a flame crown from the top of the cranium
  (`FireCloud` × 3: white-hot `#FFD27A`, orange `#FF7A1A`, crimson
  `#FF003C`; particles rise and taper), slow dried-blood embers rising past
  the face, 60 orbiting `CosmicSparks`, and a flickering fire light.
- **Altar** (`AltarPedestal`): a stone slab (3.8 × 2.6 × 0.16, brass edges)
  tilted `rotation={[-Math.PI / 2.4, 0, 0]}` at `ALTAR_Y = -1.05`, with a
  ritual circle on its top face: rune rings and ticks (`ALTAR_TINT[aura]`),
  a {5/2} pentagram and inner rings in violet `#A13CFF` mixed 50% with the
  tint, counter-rotating, breathing. `AshRise`: 110 ash/ember points spawn
  across the altar disc and drift upward. Tint: idle/crimson `#FF003C` → purple
  `#9D4EDD` → green `#00FF66`.
- **Seals** (`StageNode3D`): tall Gothic lancet windows: a carved stone
  frame (`archShape()`, half-width 0.6, height 2.06; the click target) with a
  brass moulding, a pointed stained-glass light in the stage hue
  (`SEAL_GLASS`: Corrupted Code / Purified Output emerald, Spectral Scanner
  violet, Kiro Exorcism Reasoning crimson; crimson on `error`), lead mullion
  and transoms, a brass rose roundel, and a faceted crystal emblem in the
  live `STATUS_HEX` color. The glass line also takes the status color. Glass
  opacity: pending 0.2, active/error pulsing, done 0.62.
- **Banners** sit on each window's lower stone plaque (`LABEL_OFFSET.y =
  -0.64`), so they never collide: checked down to a 380×560 canvas with
  worst-case two-line titles (≥ 39px vertical and ≥ 43px horizontal gaps).
  Line 1: stage title; line 2: `stageMeta` (`<STATUS> · <stage time>`).
- **Soul chains** (`Segment`): between consecutive seals, two writhing
  `TendrilStrand`s (a `THREE.Line` rewritten in place each frame along
  `tendrilPoint()`: bowed away from the skull + travelling wave) and soul
  particles (`ConduitStream`) riding the same path, at `CONDUIT_Z = -0.9`
  behind the windows. Unlit chains are drawn once, static and dim.
  **Ritual FX** (run-start zoom pulse + aura shockwaves) are unchanged.
- **Nave** (`CathedralNave` in `AgentCanvas.tsx`): a decorative SVG behind
  the transparent canvas: central pointed arch with a lancet, side arcades,
  clustered piers, rib vaulting, faint ruby glow.


## Screen-space labels over WebGL

- Render stage labels as a DOM overlay outside `<Canvas>`; project each label
  from a 3D node anchor with `localToWorld(...).project(camera)` every frame.
  This avoids React 19's synchronous-root-unmount warning from Drei `Html`.
- The overlay is `pointer-events: none` so labels never steal orbit or seal
  clicks. Use `will-change: transform` and direct style writes, not state.
- Labels are clamped inside the canvas every frame using their measured
  width (`EDGE_GAP_PX` = 8), however the graph is orbited.
- Labels are swallowtail stone banners: Cinzel Decorative 12px title in the
  status color, a JetBrains Mono 12px meta line, brass edging,
  `max-w-[var(--label-max,176px)]` (`labelMaxPx()` = 30% of canvas width,
  112–176px). Long names wrap to two lines.
- Camera is `[0, 0.18, 6.0]` with `fov: 45`. Seals sit at `(±2.75, ±1.58)`.
- Graph scale comes from `fitGraph(width, height, reserveTopPx,
  reserveBottomPx)`: the largest scale up to `1.15` (floor `0.4`) that keeps
  the windows (`SEAL_HALF_W`, `SEAL_HALF_H`, incl. hover scale 1.06 and
  float) and both HUD strips inside the canvas, plus a vertical offset that
  centres the graph between them. `AgentCanvas` reserves 64px on top and
  104px at the bottom (status line + four stage cards).
- The seal inspection card sits above the stage cards (`bottom-[112px]`).


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
- If WebGL fails or is unavailable, the dashboard must still function: the
  Ritual Graph renders the 2D pipeline, and the page backdrop is wrapped in
  `WebGLBoundary` so a failed canvas renders nothing instead of crashing.
- `prefers-reduced-motion` defaults the Ritual Graph to 2D (the user can still
  pick 3D).
- `prefers-reduced-motion` is not allowed to break the app; keep CSS animations
  subtle and avoid scroll-jacking.

## Non-negotiables

- No fake 3D progress. Seal statuses come from real SSE `nodeStatus` events.
- No second color system. Use `AURA_HEX` and the Tailwind tokens.
- No heavy post-processing passes (bloom/DOF) in v1; emissive + additive
  blending + CSS vignette provide the cinematic look.
- No `any`, no untyped public component APIs.
- `npm run build` must pass with zero errors before shipping.
