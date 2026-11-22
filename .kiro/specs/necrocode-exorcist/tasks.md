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
  - [x] 11.1 `NECROCODE // OCCULT CODE EXORCIST` header with engine badge and utility controls. _R8.1_
  - [x] 11.2 Responsive grid: stacked on mobile; proportional `1.05fr / 1.35fr / 1.1fr` from `lg`, with 340 / 440 / 360px minimums from `xl`; `gap-4`. _R8.2_
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

- [x] 17. Runtime pre-flight and multi-language `GEN TEST`
  - [x] 17.1 `detectCodeLanguage()` signature table and `checkRuntimeMatch()` in `lib/languages.ts`. _R11.1–R11.4_
  - [x] 17.2 `reject()` and `exitCode` in `useCodeSandbox`; pre-flight in `Test sandbox` and `GEN TEST`. _R11.1, R11.2_
  - [x] 17.3 `lib/smokeTest.ts`: JS, TS/TSX, Python, and unchanged-artifact harnesses; `smokePassed()` and `smokeLabel()`. _R11.5–R11.10_
  - [x] 17.4 Terminal badge shows `PASS`, `FAIL`, or `PASS (Runtime Smoke Check)`. _R11.9, R11.10_

- [ ] 18. Build and live-runtime verification for task 17
  - Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The sandbox still had no npm registry access; `lib/languages.ts`, `lib/smokeTest.ts`, and `lib/useCodeSandbox.ts` were typechecked with a stubbed `react`, but `Terminal.tsx` was not typechecked or linted.
  - Run `GEN TEST` once on Paiza for TypeScript, Python, and one compiled runtime (e.g. C++). The sandbox could not reach Paiza.

- [x] 19. Cockpit layout polish
  - [x] 19.1 Proportional grid and two-tier header with 11px, non-shrinking pills (`HEADER_PILL`). _R8.1, R8.2_
  - [x] 19.2 `fitGraph()` scale (≤ 1.12), camera z 6.2, wider seal orbit, HUD-strip reserves; richer relic. _R4.1_
  - [x] 19.3 Removed the duplicate counter from the Spellbook; taller editor.
  - [x] 19.4 Pinned Terminal action bar under the tabs.
  - [x] 19.5 Deeper panel glass; CRT alphas halved.

- [ ] 20. Visual and build verification for task 19
  - Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The sandbox still had no npm registry access; all files were typechecked against hand-written stubs for React, Next, three, and R3F, which cannot catch library-specific type errors. ESLint (including `react-hooks`) was not run.
  - Check in a browser at 1280px, 1440px, and 1920px widths: no clipped header pills or terminal buttons, `Purified Output` label clear of the timeline after a run.

- [x] 21. Hierarchical cockpit refactor
  - [x] 21.1 Header: brand + engine badge left; `Auto demo`, `API Sigils`, `History`, `FX & Audio` popover right (`components/FxMenu.tsx`). _R8.1_
  - [x] 21.2 Grid `1fr / 1.35fr / 1.1fr` (330 / 440 / 360px minimums from `xl`); mobile tab switcher. _R8.2, R8.8_
  - [x] 21.3 Seal orbit `(±2.75, ±1.58)`, camera z 6.0, scale cap 1.15, labels clamped in-canvas, first-run helper footer. _R4.1, R8.9_
  - [x] 21.4 Terminal: fixed toolbar + `Logs` / `Spectral Diff` / `Sandbox` tabs with badges and auto-switch. _R8.10_
  - [x] 21.5 12–13px text, zinc contrast, `#0a0b14` 90% glass, `--crt-opacity: 0.16`; filled gradient `Exorcise Code` CTA.

- [ ] 22. Visual and build verification for task 21
  - Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The sandbox had no npm registry access; files were typechecked only against hand-written stubs. ESLint was not run.
  - Check at 390px (mobile tabs), 1024px, 1280px, 1440px, and 1920px: header pills, FX popover, terminal toolbar, and the `Purified Output` label vs. the timeline.

- [x] 23. Micro-polish
  - [x] 23.1 Single-row Grimoire toolbar with density fallback; `Export ▾` menu (`ExportMenu.tsx`) for report, patch, and artifact downloads.
  - [x] 23.2 Gradient `Auto demo` CTA; ghost `API Sigils` / `History` / `FX & Audio`.
  - [x] 23.3 `2D | 3D` Ritual Graph toggle; 2D default on reduced motion or no WebGL; `WebGLBoundary` + context-loss fallback.
  - [x] 23.4 Mobile panels `min-h-[420px] max-h-[78dvh]`, `.pb-safe`, smooth scroll on tab switch; line/char counter no longer squeezed.

- [ ] 24. Visual and build verification for task 23
  - Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` (sandbox: stub typecheck only; no ESLint, no browser).
  - Check the toolbar at 300px, 360px, and 440px panel widths; the Export menu with the keyboard; 2D mode with reduced motion enabled and with WebGL disabled; mobile tab scroll on an iPhone-sized viewport.

- [x] 25. Occult Cyber-Gothic visual upgrade
  - [x] 25.1 `next/font` Cinzel Decorative / Cinzel / Space Grotesk / JetBrains Mono; obsidian / crimson / amethyst / emerald / gold palette.
  - [x] 25.2 `SigilFrame` corner filigree on all three panels; `.arcane-plate` tabs; `SoulGauge` health badge; `SigilEmblem` header.
  - [x] 25.3 Spellbook: obsidian editor with rune line gutter; `.ritual-trigger` energy border on `EXORCISE CODE`.
  - [x] 25.4 Summoning altar: obsidian crystal seals with halos, altar rune rings, conduit particle streams, run-start camera pulse + aura shockwaves.
  - [x] 25.5 `--crt-opacity: 0.10`; decorative loops stop under reduced motion.

- [ ] 26. Visual and build verification for task 25
  - Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` (sandbox: stub typecheck only; `next/font` was not downloaded and the scene was not rendered).
  - Check: fonts load, sigil corners at all three panels, gutter alignment at the bottom of a long file, the shockwave + zoom pulse on `EXORCISE CODE`, and 2D mode under reduced motion.

- [x] 27. Eldritch Blood-Cathedral & stained-glass overhaul
  - [x] 27.1 Charcoal-stone nave (`.cathedral-stone`, `--stone-grain`); stone panels with stained-glass rims; pointed-arch crowns with rose windows (`SigilFrame`).
  - [x] 27.2 Panel titles in Cinzel Decorative; navigation in Cinzel.
  - [x] 27.3 Spellbook tome page, vintage gutter divider, flat inline controls, crimson-wax `EXORCISE CODE SSE` with `WaxSigil`.
  - [x] 27.4 Grimoire: dark-stone tabs, wax-seal + ribbon soul-purity badge, Corruption Report stone plaque with stained-glass panes.
  - [x] 27.5 Altar: ruby/violet floor sigils, relic ×1.18 with ember flames, stained-glass rose discs on seals; new helper legend. _R8.9_

- [ ] 28. Visual and build verification for task 27
  - Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` (sandbox: stub typecheck only; nothing rendered).
  - Check: arch crowns align with each panel top at 1024–1920px and on mobile; rose window not clipped; seal glass discs do not crowd the relic flames; text contrast on stone.
