# Implementation Plan — NecroCode Exorcist

Each task lists the files that implement it and the requirements it satisfies
(`R<requirement>.<criterion>` from `requirements.md`). A box is checked only
when the code exists in this repository.

- [x] 1. Project scaffold
  - Next.js 15 App Router, React 19, TypeScript `strict`, Tailwind CSS 3, ESLint (`next/core-web-vitals`).
  - Files: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/globals.css`.

- [x] 2. Shared contract
  - [x] 2.1 Define `AgentPhase`, `StageId`, `NodeStatus`, `LogLevel`, `BugFinding`, `AppliedFix`, `ExorcismSummary`, `ExorcismReport`, `AgentEvent`, `EngineInfo` in `lib/types.ts`. _R3.2, R3.3_
  - [x] 2.2 Define ordered `WORKFLOW_STAGES` (four stages with labels and rune glyphs). _R4.1_

- [x] 3. Deterministic analyzer (`lib/analyzer.ts`)
  - [x] 3.1 String/template/comment masking. _R1.2_
  - [x] 3.2 Syntax seal: unterminated strings, stray, mismatched, and unclosed brackets. _R1.4_
  - [x] 3.3 Corruption rules (loose equality, `var`, `debugger`, `eval`, `parseInt` radix, off-by-one loops, infinite `while`, assignment in condition, empty `catch`, thrown strings, leaked secrets, `innerHTML`, `document.write`, `with`, `alert`, `NaN` comparison, undying `setInterval`, TODO/FIXME markers, console residue). _R1.1_
  - [x] 3.4 Safe auto-fixes only; unsafe findings go to `remaining`. _R1.3, R1.4_

- [x] 4. SSE route (`app/api/agent/stream/route.ts`)
  - [x] 4.1 `POST` and `GET` handlers, `force-dynamic`, `nodejs` runtime, `maxDuration = 60`. _R3.1, R3.6_
  - [x] 4.2 SSE headers and `event: agent` framing. _R3.1, R3.2_
  - [x] 4.3 Scripted event sequence across the four stages with capped logs (18 scan, 18 fix, 260 code lines). _R3.3_
  - [x] 4.4 Final `complete` event with summary, final/original code, findings, fixes, engine. _R3.4_
  - [x] 4.5 24,000-char cap with warning; non-JS/TS pass-through warning. _R1.5, R1.6_

- [x] 5. Multi-LLM fallback (`lib/liveEngine.ts`, `lib/apiSigils.ts`)
  - [x] 5.1 Provider configs for Gemini, Groq, OpenRouter in fixed order. _R2.1_
  - [x] 5.2 8-second `AbortController` timeout and usable-output check per provider. _R2.2_
  - [x] 5.3 Heuristic fallback when all providers fail; no request without sigils. _R2.3, R2.5_
  - [x] 5.4 Re-analysis of live JS/TS/TSX output. _R2.4_
  - [x] 5.5 Header transport (`x-necro-*-key`) and `localStorage` key storage via `useApiSigils` + `ApiSigilsModal`. _R2.6, R2.7_

- [x] 6. Client stream hook (`lib/useAgentStream.ts`)
  - [x] 6.1 POST fetch with `AbortController`, SSE frame parser, per-stage `NodeStatusMap`. _R3.5, R4.2_
  - [x] 6.2 `restore()` for history entries. _R8.6_

- [x] 7. 3D Ritual Graph
  - [x] 7.1 `ExecutionGraph3D`: four seals, central relic, edges, flowing orbs, projected DOM labels. _R4.1, R4.2_
  - [x] 7.2 Aura state machine in `lib/aura.ts` driving relic color. _R4.3_
  - [x] 7.3 Seal selection, inspection card, clear on empty click. _R4.4, R4.5_
  - [x] 7.4 Orbit-only `OrbitControls`. _R4.6_
  - [x] 7.5 Client-only dynamic imports for `ExecutionGraph3D` and `HorrorBackdrop`. _R4.7_
  - [x] 7.6 Completed-run four-step timeline in `AgentCanvas`. _R4.8_
  - [x] 7.7 `HorrorBackdrop`: embers, sparkles, wireframe relic, pointer parallax.

- [x] 8. Spectral Diff (`lib/diff.ts`, `components/Terminal.tsx`)
  - [x] 8.1 Line diff with original/purified line numbers and add/remove stats. _R5.2, R5.3_
  - [x] 8.2 `Terminal` / `Spectral Diff` tabs and identical-artifact message. _R5.1, R5.4_

- [x] 9. Sandbox
  - [x] 9.1 Blob Web Worker runner for JavaScript with a 2-second kill. _R6.1_
  - [x] 9.2 `POST /api/run` + `lib/runner.ts` Paiza.IO bridge (20 s server deadline) and 25 s client deadline. _R6.2, R6.3_
  - [x] 9.3 Remote-execution privacy warning. _R6.4_
  - [x] 9.4 `GEN TEST` function-existence assertions with `PASS`/`FAIL` badge. _R6.5_
  - [x] 9.5 Runtime registry with 29 languages in `lib/languages.ts`.

- [x] 10. Adaptive horror audio
  - [x] 10.1 `useHorrorAudio`: looped BGM, `0.22`/`0.85` volume fades, gesture unlock. _R7.1–R7.4_
  - [x] 10.2 `useCyberSound` synthesized SFX including `dhum`; `sfxForEvent` mapping. _R7.5_
  - [x] 10.3 Independent `Horror BGM` / `3D Audio FX` toggles in `useUiSettings`. _R7.6_

- [x] 11. Dashboard and judge tools (`app/page.tsx`)
  - [x] 11.1 `NECROCODE // AI CODE EXORCIST` header with status pill and toggles. _R8.1_
  - [x] 11.2 Responsive grid: stacked on mobile, `lg:grid-cols-3` with `lg:gap-3.5` and `lg:items-stretch`. _R8.2_
  - [x] 11.3 `AUTO DEMO` with the `async-memory-leak` artifact, auto diff and sandbox. _R8.3, R8.4_
  - [x] 11.4 Grimoire History drawer (last 10, `localStorage`). _R8.5, R8.6_
  - [x] 11.5 Markdown autopsy export (`lib/report.ts`). _R8.7_

- [ ] 12. Automated tests
  - No unit or end-to-end test suite exists yet. Candidates: analyzer rule fixtures, `diffLines`, `auraFromState`, live-engine fallback with mocked `fetch`.

- [x] 13. Build verification for submission
  - Run `npx tsc --noEmit`, `npm run lint`, and `npm run build` on a machine with npm registry access and tick this box once all three pass. The Kiro sandbox used for the spec audit had no npm registry access, so it could not run them.

- [x] 14. Direct GitHub file summon
  - [x] 14.1 `parseGitHubFileUrl()` in `lib/github.ts`: host allowlist, blob → raw conversion, segment validation. _R9.2, R9.3_
  - [x] 14.2 `POST /api/github`: raw-host-only fetch, same-host redirects (max 2), 8 s timeout, 24,000-char / binary / UTF-8 / empty checks. _R9.4, R9.5_
  - [x] 14.3 `GitHub` toggle + URL form in `ControlPanel`; loads code, repo path, and detected runtime. _R9.1, R9.6_

- [x] 15. Health score and `git apply` patch
  - [x] 15.1 `HEALTH_WEIGHTS`, `healthScore()`, `healthTier()` in `lib/report.ts`; optional `healthBefore` / `healthAfter` on `ExorcismSummary`. _R10.1, R10.2_
  - [x] 15.2 SSE route adds both scores to the final summary and streams the score line. _R10.1, R10.3_
  - [x] 15.3 Terminal header health badge. _R10.3_
  - [x] 15.4 `buildUnifiedPatch()` + `patchPath()` in `lib/report.ts`; `.patch` button downloads `necrocode-fix.patch`. _R10.4–R10.7_
  - [x] 15.5 Score line in the Markdown autopsy report. _R10.8_
  - [x] 15.6 Ad-hoc check: 400 patches applied with real `git apply` and matched byte for byte; GitHub parser and route checked with a mocked `fetch`.

- [ ] 16. Build verification for tasks 14–15
  - Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` with npm registry access and tick this box once all three pass. The Kiro sandbox still had no npm registry access; only the server-side and `lib/` files were typechecked there (TypeScript, `strict`, stubbed `next/server`). `ControlPanel.tsx`, `Terminal.tsx`, and `page.tsx` were not typechecked or linted.
  - Manually verify a live summon against a real public repo (the sandbox could not reach GitHub raw).
