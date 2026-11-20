# NecroCode — Engineering Conventions

> General engineering rules for every change in this repository.
> Theme, layout, analyzer, and SSE details live in `#[[file:horror-rules.md]]`.
> 3D/WebGL rules live in `#[[file:3d-horror-rules.md]]`.
> The feature spec lives in `.kiro/specs/necrocode-exorcist/`.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 App Router (route handlers for SSE and the sandbox proxy) |
| UI | React 19, Tailwind CSS 3 (tokens in `tailwind.config.ts`), Framer Motion 11 |
| 3D | three, @react-three/fiber 9, @react-three/drei 10 (client-only) |
| Icons | lucide-react only |
| Language | TypeScript `strict: true`, no `any` |
| Lint | ESLint `next/core-web-vitals` |
| Deploy | Vercel (Node.js runtime routes) |

## Code organization

- `app/` — page shell (`page.tsx`), layout, and route handlers
  (`api/agent/stream`, `api/run`).
- `components/` — UI panes and controls; `components/three/` holds R3F scenes.
- `lib/` — shared types (`types.ts`), server logic (`analyzer.ts`,
  `liveEngine.ts`, `runner.ts`), and client hooks (`use*.ts`).
- Shared types are defined once in `lib/types.ts` and imported by server and
  client.
- Server-only modules (`analyzer.ts`, `liveEngine.ts`, `runner.ts`,
  `cursedCode.ts`) must not import React, DOM APIs, or icon packages.
- Client components start with `"use client"`.

## Runtime rules

- Route handlers set `dynamic = "force-dynamic"` and `runtime = "nodejs"`.
- No secrets in code or env by default. BYOK keys stay in browser
  `localStorage` and travel only as `x-necro-*-key` headers.
  `PAIZA_API_BASE` / `PAIZA_API_KEY` are optional server env vars.
- Browser persistence uses versioned `localStorage` keys
  (`necrocode.api-sigils.v1`, `necrocode.grimoire-history.v1`).
- Code sent to the remote runner leaves the browser; keep the warning in the UI.

## Quality gate

- `npm run lint`, `npx tsc --noEmit`, and `npm run build` must pass with zero
  errors before a commit is pushed.
- When a change touches the SSE contract, aura mapping, or phase labels,
  update `.kiro/specs/necrocode-exorcist/design.md` in the same commit.
- Mark a task `[x]` in `tasks.md` only when the code exists.

## Non-functional requirements

- **Responsive:** panes stack on mobile and become three equal columns on `lg+`.
- **Accessible:** real `<button>`s with `aria-label` / `aria-pressed`;
  the terminal uses `role="log"` and `aria-live="polite"`.
- **Resilient:** abortable streams, safe reset, and a WebGL loader fallback.
