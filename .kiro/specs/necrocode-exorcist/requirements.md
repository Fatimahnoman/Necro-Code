# Requirements Document — NecroCode Exorcist

## Introduction

NecroCode is a 3D horror cyber-gothic code exorcist built with Next.js 15 and
React Three Fiber for the Kiroween 2026 Costume Contest (UI/UX track). A user
submits a source artifact by pasting, uploading, or summoning a file from a
public GitHub repository. The server runs a deterministic static analyzer for
JavaScript/TypeScript/TSX, optionally asks a bring-your-own-key (BYOK) LLM
provider for a rewrite, and streams the ritual over Server-Sent Events (SSE).
The client mirrors every streamed event in a 3D Ritual Graph, a terminal, a
Spectral Diff, a sandbox runner, and an adaptive audio layer. Each run ends
with a 0–100 health score and a patch that `git apply` accepts.

Every requirement below maps to code that exists in this repository. File
references point to the implementing module.

## Glossary

- **Artifact** — the source code submitted for exorcism.
- **Sigil** — a user-supplied BYOK API key for a live LLM provider.
- **Heuristic engine** — the deterministic analyzer in `lib/analyzer.ts`.
- **Ritual Graph** — the 3D stage graph in `components/three/ExecutionGraph3D.tsx`.
- **Aura** — the aggregate run state rendered on the 3D relic (`lib/aura.ts`).
- **AgentEvent** — one SSE payload, defined in `lib/types.ts`.
- **Health score** — Code Health & Security Score, 0–100, from `healthScore()` in `lib/report.ts`.
- **Summon** — loading a public GitHub file into the editor via `/api/github`.

---

### Requirement 1 — Deterministic static exorcism

**User story:** As a developer, I want my JS/TS code scanned by a deterministic
engine, so that I get real findings and safe fixes without any API key.

#### Acceptance criteria

1. WHEN the submitted artifact language is `javascript`, `typescript`, or `tsx`, THE SSE route SHALL run `exorciseCode()` from `lib/analyzer.ts` before any live provider is attempted.
2. WHEN the analyzer scans an artifact, THE analyzer SHALL mask string, template, and comment bodies before rule matching so that their contents do not produce findings.
3. WHEN a rule's fix is unambiguous (for example loose equality, `var`, radix-less `parseInt`, `innerHTML` assignment, `NaN` comparison), THE analyzer SHALL apply the fix and record it in `appliedFixes`.
4. WHEN a rule's fix is unsafe (for example `eval`, `document.write`, `with`, unclosed `(` or `[`, unterminated strings), THE analyzer SHALL report the finding in `remaining` and SHALL NOT rewrite that code.
5. WHEN the submitted artifact exceeds 24,000 characters, THE SSE route SHALL truncate it to 24,000 characters and SHALL stream a warning event.
6. WHEN the artifact language is not JavaScript, TypeScript, or TSX, THE SSE route SHALL skip the builtin rules and SHALL stream a pass-through warning that names the language.

### Requirement 2 — Multi-LLM fallback pipeline

**User story:** As a developer with API keys, I want a live LLM rewrite with
automatic fallback, so that one failing provider never breaks the ritual.

#### Acceptance criteria

1. WHEN at least one sigil is present in the `x-necro-gemini-key`, `x-necro-groq-key`, or `x-necro-openrouter-key` request headers, THE live engine (`lib/liveEngine.ts`) SHALL try the configured providers in the order Gemini (`gemini-2.5-flash`) → Groq (`llama-3.3-70b-versatile`) → OpenRouter (`openrouter/auto`).
2. WHEN a provider request exceeds 8 seconds, returns a non-OK status, throws, or returns unusable output, THE live engine SHALL skip to the next configured provider.
3. WHEN every configured provider fails, THE SSE route SHALL keep the Heuristic engine's result and SHALL report the engine as `Heuristic`.
4. WHEN a live provider returns usable code for a JS/TS/TSX artifact, THE SSE route SHALL use it as `finalCode` and SHALL re-analyze it for residual findings.
5. WHEN no sigil is configured, THE SSE route SHALL make no outbound LLM request.
6. THE system SHALL send sigils only as request headers and SHALL NOT include them in request bodies or SSE payloads.
7. WHEN the user saves sigils in the API Sigils modal, THE client SHALL store them in browser `localStorage` under `necrocode.api-sigils.v1`.

### Requirement 3 — SSE event stream

**User story:** As a user, I want to watch the exorcism happen live, so that the
UI reflects real work instead of a fake spinner.

#### Acceptance criteria

1. WHEN the client calls `POST /api/agent/stream` with `{ code, directive, language }`, THE SSE route SHALL respond with `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no`.
2. WHEN the route emits a frame, THE route SHALL name it `agent` and SHALL encode one `AgentEvent` as JSON.
3. WHILE a run is in progress, THE route SHALL emit `phase` values from `idle`, `thinking`, `tool_call`, `executing`, `complete`, and `nodeStatus` values from `pending`, `active`, `done`, `error`.
4. WHEN the run finishes, THE route SHALL emit a final `complete` event with `progress = 100`, `summary`, `finalCode`, `originalCode`, `findings`, `appliedFixes`, and `engine`.
5. WHEN the client aborts the request, THE client hook (`lib/useAgentStream.ts`) SHALL stop reading the stream without surfacing an error.
6. THE route SHALL also accept `GET /api/agent/stream?code=…&directive=…&language=…`.

### Requirement 4 — 3D Ritual Graph

**User story:** As a judge, I want a 3D scene that mirrors the real run, so that
the costume and the analysis stay in sync.

#### Acceptance criteria

1. WHEN the dashboard renders, THE Ritual Graph SHALL show four seals in `WORKFLOW_STAGES` order: Corrupted Code → Spectral Scanner → Kiro Exorcism Reasoning → Purified Output.
2. WHEN an `AgentEvent` carries a `stage` and `nodeStatus`, THE Ritual Graph SHALL render that seal in the matching status color (`pending`, `active`, `done`, `error`).
3. WHEN the phase, bug count, or summary changes, THE central relic SHALL take its color from `auraFromState()` in `lib/aura.ts` (`idle`, `crimson`, `purple`, `green`).
4. WHEN the user clicks a seal, THE Ritual Graph SHALL select it and THE AgentCanvas SHALL show an inspection card with status, engine, stage duration, and severity counts.
5. WHEN the user clicks empty graph space, THE Ritual Graph SHALL clear the selection.
6. THE Ritual Graph SHALL allow orbit rotation and SHALL disable pan and zoom.
7. THE Ritual Graph and HorrorBackdrop canvases SHALL load through `next/dynamic` with `ssr: false`.
8. WHEN the phase is `complete`, THE AgentCanvas SHALL show a four-step timeline (`DORMANT`, `SCANNING`, `EXORCISING`, `PURIFIED`) whose buttons select the matching stage for inspection.

### Requirement 5 — Spectral Diff

**User story:** As a developer, I want to compare the original and purified
code, so that I can see exactly what changed.

#### Acceptance criteria

1. WHEN both `originalCode` and `finalCode` are available, THE Terminal SHALL offer a `Spectral Diff` tab next to the `Terminal` tab.
2. WHEN the Spectral Diff tab is open, THE Terminal SHALL render one unified line diff from `diffLines()` in `lib/diff.ts`, with original and purified line-number gutters and `-`/`+` markers.
3. WHEN the diff renders, THE Terminal SHALL show the counts of removed and added lines.
4. WHEN the original and purified artifacts are identical, THE Terminal SHALL state that they match line for line.

### Requirement 6 — Web Worker sandbox and remote runner

**User story:** As a developer, I want to run the purified artifact safely, so
that I can confirm it executes.

#### Acceptance criteria

1. WHEN the user runs a purified JavaScript artifact, THE sandbox (`lib/useCodeSandbox.ts`) SHALL execute it in a Blob-backed Web Worker and SHALL terminate it after 2 seconds.
2. WHEN the user runs an artifact in any other supported language, THE sandbox SHALL send it to `POST /api/run`, which SHALL forward it to the Paiza.IO runner with a 20-second server deadline.
3. WHEN a remote run exceeds 25 seconds on the client, THE sandbox SHALL report a timeout.
4. WHEN the user starts the first remote run, THE sandbox SHALL warn that the code leaves the browser and is executed by Paiza.IO.
5. WHEN the user clicks `GEN TEST` and a purified artifact exists, THE Terminal SHALL build a smoke harness for the selected runtime (see Requirement 11) and SHALL run it through the sandbox.

### Requirement 7 — Adaptive horror audio

**User story:** As a judge, I want sound that reacts to the ritual, so that the
costume feels alive.

#### Acceptance criteria

1. WHILE `Horror BGM` is enabled and no run is active, THE BGM engine (`lib/horrorAudio.ts`) SHALL loop `/audio/horror-bgm.mp3` at volume `0.22`.
2. WHILE a run is active and the active stage is not `clean_code_output`, THE BGM engine SHALL fade the volume up to `0.85`.
3. WHEN the run reaches the purified output stage or ends, THE BGM engine SHALL fade the volume back to `0.22`.
4. WHEN the browser blocks autoplay, THE BGM engine SHALL start playback on the first pointer, key, or touch event.
5. WHEN `3D Audio FX` is enabled and a run starts, THE client SHALL play the synthesized `dhum` effect, and WHEN later events arrive THE client SHALL play the effect returned by `sfxForEvent()`.
6. THE `Horror BGM` and `3D Audio FX` toggles SHALL be independent: neither SHALL mute the other.

### Requirement 8 — Dashboard, branding, and judge tools

**User story:** As a judge, I want to experience the whole product in one click,
so that I can evaluate it quickly.

#### Acceptance criteria

1. WHEN the header renders, THE dashboard SHALL display a crest and `NECROCODE // AI CODE EXORCIST` on the left, and `AUTO DEMO`, `HISTORY [n]`, `API SIGILS` (with the active engine's status dot and text alternative), and an `FX & Audio` popover (Horror BGM, 3D Audio FX, CRT, Fog switches) on the right.
2. WHEN the viewport is `lg` or wider, THE dashboard SHALL lay out Spellbook, Ritual Graph, and Grimoire Terminal as three proportional columns (`1fr / 1.35fr / 1.1fr`, with 330 / 440 / 360px minimums from `xl`).
8. WHILE the viewport is narrower than `lg`, THE dashboard SHALL show a `Spellbook | 3D Ritual | Grimoire` tab switcher and only the selected panel, keeping all three mounted.
9. WHILE no ritual has produced events, THE Ritual Graph footer SHALL show `1. Feed the Crypt → 2. Ignite EXORCISE CODE → 3. Inspect the Altar Seals`.
10. WHEN the user clicks `Test sandbox` or `GEN TEST`, THE Terminal SHALL switch to its `Sandbox` tab; THE `Sandbox` tab SHALL show a status badge whenever sandbox output exists.
3. WHEN the user clicks `AUTO DEMO`, THE dashboard SHALL load the `async-memory-leak` artifact, set the demo directive, and start a run.
4. WHEN an `AUTO DEMO` run completes with a purified artifact, THE Terminal SHALL switch to the Spectral Diff tab and SHALL start the sandbox run.
5. WHEN a run completes, THE client SHALL save it to the Grimoire History in `localStorage` (`necrocode.grimoire-history.v1`), keeping the last 10 entries.
6. WHEN the user selects a history entry, THE client SHALL restore its code, directive, findings, fixes, engine, summary, and logs.
7. WHEN the user clicks `Export report`, THE Terminal SHALL download a Markdown autopsy report built by `lib/report.ts`.
11. THE Ritual Graph SHALL always show four stage cards (`DORMANT`, `SCANNING`, `EXORCISING`, `PURIFIED`) at its base with each stage's live status; clicking a card SHALL select that stage for inspection.
12. WHEN the editor renders code, THE Spellbook SHALL syntax-highlight comments, strings, numbers, and keywords for the selected runtime without changing the code.

### Requirement 9 — Direct GitHub file summon

**User story:** As a developer, I want to load a file straight from a public
GitHub repository, so that I can exorcise real code without copy-pasting.

#### Acceptance criteria

1. WHEN the user clicks `GitHub` next to `Upload` in the Spellbook, THE ControlPanel SHALL toggle a single-line form with a `Paste public GitHub file URL...` input and a `Fetch` button.
2. WHEN the user submits a `github.com/<owner>/<repo>/blob/<ref>/<path>` URL, THE system (`lib/github.ts`) SHALL convert it to `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`; a `raw.githubusercontent.com` URL SHALL be accepted as-is; query strings and fragments SHALL be ignored.
3. WHEN the URL host is not `github.com`, `www.github.com`, or `raw.githubusercontent.com`, or the URL contains credentials, a port, `.`/`..` segments, or encoded `/` or `\`, THE system SHALL reject it without making a network request.
4. WHEN `POST /api/github` fetches the raw file, THE route SHALL only contact `raw.githubusercontent.com`, SHALL follow at most two redirects and only to that host, and SHALL abort after 8 seconds.
5. IF the file is missing or private, larger than 24,000 characters, binary, not valid UTF-8, or empty, THEN THE route SHALL return an error message and THE ControlPanel SHALL show it without changing the editor.
6. WHEN the fetch succeeds, THE ControlPanel SHALL load the source into the editor, set the filename to the repo-relative path, and set the runtime from the file extension; IF the extension is unknown, THEN THE runtime SHALL stay unchanged.

### Requirement 10 — Health score and `git apply` patch

**User story:** As a reviewer, I want a score and a patch I can apply, so that
I can judge the risk of a file and ship the fix in my own repository.

#### Acceptance criteria

1. WHEN the analyzer language is JavaScript, TypeScript, or TSX, THE SSE route SHALL add `healthBefore` (all findings) and `healthAfter` (residual findings) to the final `summary`, each computed by `healthScore()` as `100 − 15·critical − 6·warning − 2·info`, clamped to 0–100.
2. WHEN the analyzer language is not supported, THE SSE route SHALL omit both scores.
3. WHEN the final summary carries both scores, THE route SHALL stream a `Code Health & Security Score: <before>/100 → <after>/100` line and THE Terminal header SHALL show a `<before> → <after> /100` badge colored crimson (< 50), amber (50–79), or neon (≥ 80).
4. WHEN the run completes and the purified artifact differs from the original, THE Terminal SHALL enable a `.patch` button next to `Export report` that downloads `necrocode-fix.patch`.
5. THE patch SHALL be a unified diff with `diff --git a/<path> b/<path>`, `---`/`+++` headers, `@@` hunks with three lines of context, and `\ No newline at end of file` markers where needed, so that `git apply necrocode-fix.patch` succeeds on the original LF file at `<path>` relative to the repository root.
6. WHEN the patch is built, THE system SHALL use the editor filename or GitHub path as `<path>`, SHALL fall back to `artifact.<ext>` for absolute or `..` paths, and SHALL keep the original file's trailing-newline style.
7. WHEN no lines changed, THE `.patch` button SHALL be disabled.
8. WHEN the autopsy report is exported and both scores exist, THE report SHALL include the before → after score and the weights.

### Requirement 11 — Runtime pre-flight and multi-language `GEN TEST`

**User story:** As a developer, I want the sandbox to catch a wrong runtime and
to test my code in its own language, so that a failure means my code failed,
not the harness.

#### Acceptance criteria

1. WHEN the user clicks `Test sandbox` or `GEN TEST`, THE Terminal SHALL run `checkRuntimeMatch()` (`lib/languages.ts`) on the purified artifact before anything executes.
2. WHEN `detectCodeLanguage()` finds a language with a signature score of at least 4, the score beats every other language, that language cannot run on the selected runtime, and the selected runtime's own score is below 3, THE Terminal SHALL NOT run the code and SHALL show in the Sandbox output panel: `⚠ Language Mismatch: Your code looks like <DetectedLanguage>, but <SelectedRuntime> is selected. Please switch the runtime selector next to the filename to <DetectedLanguage> and run again.`
3. WHEN the detected language is JavaScript and the runtime is TypeScript or TSX, or the detected language is TypeScript and the runtime is TSX, or the detected language is C and the runtime is C++ or Objective-C, THE pre-flight SHALL allow the run.
4. IF no signature reaches the threshold, THEN THE pre-flight SHALL allow the run.
5. WHEN the runtime is JavaScript, THE `GEN TEST` harness SHALL wrap the artifact in an async function, assert with a JS `__necroAssert` that every top-level function (column-0 `function` declarations and arrow/function `const`/`let`/`var`) still exists, and print `ALL SMOKE TESTS PASSED`.
6. WHEN the runtime is TypeScript or TSX, THE harness SHALL do the same with typed TypeScript and without top-level `await`, and SHALL set a non-zero exit code on failure.
7. WHEN the runtime is Python 3, THE harness SHALL append `assert callable(<fn>)` for every top-level `def` and `print("ALL SMOKE TESTS PASSED")`, and SHALL NOT contain JavaScript syntax.
8. WHEN the runtime is any other language, THE harness SHALL run the artifact unchanged.
9. WHEN a JS/TS/Python harness finishes, THE Terminal SHALL show `PASS` only if the run completed, the remote exit code (if any) is `0`, and stdout contains `ALL SMOKE TESTS PASSED`; otherwise `FAIL`.
10. WHEN an unchanged-artifact harness finishes, THE Terminal SHALL show `PASS (Runtime Smoke Check)` only if the run completed with exit code `0`; otherwise `FAIL (Runtime Smoke Check)`. A JS/TS/Python harness with no functions to assert SHALL use the same labels.
