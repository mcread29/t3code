# AGENTS.md

## Task Completion Requirements

- Both `bun lint` and `bun typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

T3 Code is a minimal web GUI for using code agents like Codex and Claude Code (coming soon).

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there are shared logic that can be extracted to a separate module. Duplicate logic across mulitple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Minimal Changes For Fork Maintenance

This repository is a fork of an upstream project that may continue moving independently. When making changes, optimize for keeping future upstream merges straightforward.

- Prefer adding new files over editing existing upstream files.
- Keep changes localized. If an upstream file must change, prefer one small, obvious seam over many scattered edits.
- Avoid refactors that rename, move, or reshape upstream code unless the task explicitly requires it.
- Avoid broad formatting churn in touched upstream files.
- Preserve upstream behavior unless the new feature requires a deliberate change.
- If a feature can live behind a new route, new component, or small integration point, prefer that over modifying shared core flows.
- Treat divergence as a real maintenance cost. A slightly duplicated fork-specific file is often cheaper than a large invasive refactor in upstream-owned code.

When working in this fork, keep upstream relevant:

- Regularly check whether upstream has moved before starting deeper work.
- Skim upstream changes in files you plan to touch so you do not build on stale assumptions.
- Call out when a proposed change would make future rebases or merges meaningfully harder.

Useful commands:

- `git remote -v`
- `git fetch upstream`
- `git log --oneline HEAD..upstream/main`
- `git log --oneline upstream/main..HEAD`
- `git diff --stat upstream/main...HEAD`
- `git rev-list --left-right --count HEAD...upstream/main`
- `git branch --set-upstream-to=upstream/main <your-branch>`

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.

## Codex App Server (Important)

T3 Code is currently Codex-first. The server starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.
