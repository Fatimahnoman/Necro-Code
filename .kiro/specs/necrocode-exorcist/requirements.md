# Spec — NecroCode Exorcist

Status: **Implemented**
Owner: NecroCode
Track: Kiroween 2026 · Costume Contest

## Requirements

### Multi-LLM fallback
- `REQ-001`: WHEN the user submits a cursed artifact and at least one live provider key is configured, THE system SHALL attempt the ordered live fallback Gemini → Groq → OpenRouter before falling back to the deterministic Heuristic engine.
- `REQ-002`: WHEN all live provider attempts fail or time out, THE system SHALL fall back to the deterministic Heuristic without exposing provider keys.

### 3D Ritual Graph
- `REQ-003`: WHEN the SSE stream emits phase and stage updates, THE system SHALL synchronize the 3D Ritual Graph seals, aura, labels, and inspection card with the streamed state.

### Adaptive Horror BGM + DHUM! FX
- `REQ-004`: WHEN the adaptive horror BGM is enabled, THE system SHALL modulate intensity and SHALL trigger the `DHUM!` FX during the exorcism.

### Branding
- `REQ-005`: WHEN the dashboard header renders, THE system SHALL display the `NECROCODE // AI CODE EXORCIST` branding.

### Final judge polish
- `REQ-006`: WHEN the user activates `AUTO DEMO`, THE system SHALL load a curated multi-bug async/memory-leak artifact, set a ritual directive, start the exorcism, trigger the `DHUM!` FX, synchronize the 3D graph and unified side-by-side Spectral Diff, and automatically run the sandbox test.
- `REQ-007`: WHEN an exorcism completes, THE system SHALL expose a compact four-step timeline scrubber (`DORMANT`, `SCANNING`, `EXORCISING`, `PURIFIED`) that supports stage inspection and replay.
- `REQ-008`: WHEN a purified artifact exists, THE system SHALL generate a lightweight assertion suite, run it in the isolated Web Worker sandbox, and display clean `PASS` / `FAIL` test badges.

## User stories
- WHEN a user offers a cursed JavaScript/TypeScript artifact, THE system SHALL analyze it deterministically, stream real findings, and emit a purified artifact.
- WHEN live API keys are configured, THE system SHALL attempt Gemini, Groq, and OpenRouter fallbacks before using the deterministic safety net.
- WHEN the SSE stream drives the ritual, THE system SHALL update the 3D graph, aura, and terminal in real time.
- WHEN the exorcism runs, THE system SHALL adapt the BGM and fire the `DHUM!` FX.
- WHEN the header renders, THE user SHALL see the `NECROCODE // AI CODE EXORCIST` title.
- WHEN a judge clicks `AUTO DEMO`, THE system SHALL complete the full exorcism workflow in one click.
- WHEN the exorcism completes, THE user SHALL scrub and replay the four ritual stages.
- WHEN a purified artifact exists, THE user SHALL generate and run lightweight unit assertions in the isolated sandbox.

## Acceptance criteria
- [x] Multi-LLM fallback Gemini/Groq/OpenRouter works and deterministic Heuristic is the final fallback.
- [x] 3D Ritual Graph stays synchronized with SSE stage events.
- [x] Adaptive Horror BGM and `DHUM!` FX are implemented.
- [x] Header branding uses `NECROCODE // AI CODE EXORCIST`.
- [x] Judge one-click `AUTO DEMO` loads a multi-bug artifact and completes the full workflow.
- [x] Four-stage ritual timeline scrubber inspects and replays completed exorcisms.
- [x] `GEN TEST` generates, runs, and reports purified artifact assertions.
