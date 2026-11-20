# Tasks — NecroCode Exorcist

Status: **Completed**
Owner: NecroCode
Track: Kiroween 2026 · Costume Contest

## Implementation checklist

- [x] Scaffold Next.js 15 App Router + TypeScript strict + Tailwind CSS + React Three Fiber.
- [x] Implement deterministic static analyzer (masking, syntax seal, corruption rules, safe fixes).
- [x] Implement SSE route `POST /api/agent/stream` with fallback behavior.
- [x] Implement BYOK live engine fallback Gemini → Groq → OpenRouter → Heuristic.
- [x] Implement client SSE stream hook and state reducer.
- [x] Implement 3D Ritual Graph (ExecutionGraph3D, AgentCanvas, HorrorBackdrop).
- [x] Implement screen-space readable labels (9.5px base / 10px responsive) with compact single-line HUD tags and clean single-viewport layout.
- [x] Adjust 3D camera/graph scale (~0.78) for equal-column single-viewport fit.
- [x] Implement adaptive horror BGM + synthesized SFX + `DHUM!` FX.
- [x] Implement header branding `NECROCODE // AI CODE EXORCIST`.
- [x] Implement equal three-column desktop grid (`repeat(3, minmax(0, 1fr))`, `gap-3.5`) with stacked mobile layout.
- [x] Enforce flush equal-height three-panel dashboard symmetry with `items-stretch`, `flex-1 min-h-0`, `h-full ... justify-between`, and center `min-h-0 flex-1`.
- [x] Compact top status-bar pills to `text-[9.5px] px-2.5 py-1 gap-1.5` for zero right-edge clipping.
- [x] Implement unified typography hierarchy (brand title, panel headings, body/labels).
- [x] Implement sandbox (local + remote runner), grimoire history, autopsy export, spectral diff.
- [x] Implement `EXORCISE CODE` glowing button with blood-pulse hover.
- [x] Implement final judge polish: one-click `AUTO DEMO`.
- [x] Implement final judge polish: completed-exorcism timeline scrubber.
- [x] Implement final judge polish: `GEN TEST` for purified artifacts.
- [x] Verify `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass cleanly.

## Completion audit

- [x] Live AI fallback verified end-to-end with deterministic safety net.
- [x] 3D labels and layout verified against the finalized UI contract.
- [x] Audio toggles and adaptive BGM/SFX verified.
- [x] Branding, sandbox, history, and export flows verified.
- [x] `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass cleanly.
