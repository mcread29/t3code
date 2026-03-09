# Rezi TUI For T3 Code

## Summary
- Build a dedicated `apps/tui` package as the canonical TUI entrypoint, not a `t3` server subcommand. This keeps Rezi and terminal-only code out of upstream-owned server files and makes future merges materially easier.
- The TUI will start the existing backend as a local sidecar over the same WebSocket/`NativeApi` contract the web app uses today. No new server runtime mode is needed.
- Full parity target for this slice: thread/project sidebar flows, chat/composer, approvals and user input, diff/revert, project overview/task board, shared settings, git/worktree actions, and terminal sessions.
- Rezi has the right primitives for this: Node app runtime plus focus/keybinding guidance and widgets like `tree`, `commandPalette`, `codeEditor`, `diffViewer`, `logsConsole`, and `filePicker` from the official docs: [rezitui.dev](https://rezitui.dev/), [docs](https://rezitui.dev/docs).
- Existing seams to build on: [main.ts](/home/mchan/dev/t3code/apps/server/src/main.ts), [wsServer.ts](/home/mchan/dev/t3code/apps/server/src/wsServer.ts), [codexAppServerManager.ts](/home/mchan/dev/t3code/apps/server/src/codexAppServerManager.ts), [__root.tsx](/home/mchan/dev/t3code/apps/web/src/routes/__root.tsx), [appSettings.ts](/home/mchan/dev/t3code/apps/web/src/appSettings.ts), [useTheme.ts](/home/mchan/dev/t3code/apps/web/src/hooks/useTheme.ts), [projectGoals.ts](/home/mchan/dev/t3code/apps/web/src/projectGoals.ts).

## Public APIs And Types
- Add `packages/contracts/src/appSettings.ts` with the shared persisted settings schema. It will include current web app settings plus theme: `theme`, `codexBinaryPath`, `codexHomePath`, `confirmThreadDelete`, `enableAssistantStreaming`, `codexServiceTier`, `customCodexModels`.
- Extend [ipc.ts](/home/mchan/dev/t3code/packages/contracts/src/ipc.ts) `NativeApi` with `appSettings.get()`, `appSettings.update(patch)`, and `appSettings.onUpdated(listener)`.
- Extend [ws.ts](/home/mchan/dev/t3code/packages/contracts/src/ws.ts) with `appSettings.get`, `appSettings.update`, and `appSettings.updated`.
- Keep server startup/public CLI stable. The TUI will pass explicit flags to the existing server process instead of adding `mode=tui`.

## Architecture
- Add `packages/app-runtime` for cross-frontend runtime logic with explicit subpath exports. Move or extract the pure pieces currently trapped in `apps/web`: read-model sync, session/activity derivation, keybinding resolution, composer mention/slash parsing, project-goals helpers, markdown/terminal link parsing, and settings normalization.
- Add a server-side `AppSettingsStore` service under `apps/server/src/appSettings/` backed by `${stateDir}/app-settings.json`. Use schema validation plus defaulting; reject invalid patches; broadcast `appSettings.updated` after successful writes.
- Migrate web settings from local storage to the server-backed store. On first boot, if server settings are still defaults and legacy browser values exist, import them once, then stop reading the local keys. Theme moves into the same shared store.
- Add `apps/tui` with `src/index.ts`, `src/serverSupervisor.ts`, `src/nativeApiClient.ts`, `src/state/`, `src/screens/`, and `src/widgets/`.
- The TUI supervisor starts the server child in `process.cwd()` with `--mode web --no-browser --host 127.0.0.1 --port <allocated> --auth-token <random> --auto-bootstrap-project-from-cwd --state-dir <resolved>`, waits for the welcome/snapshot handshake, and tears the child down on TUI exit.
- Codex `app-server` launch behavior stays in the backend. The TUI does not launch Codex directly; it preserves the existing project/worktree `cwd` behavior already owned by [codexAppServerManager.ts](/home/mchan/dev/t3code/apps/server/src/codexAppServerManager.ts).
- `apps/tui` owns only TUI-specific rendering and controllers. All transport/state semantics stay shared through contracts and `packages/app-runtime`.
- Add root scripts `dev:tui`, `build:tui`, and `start:tui`. Do not make `scripts/dev-runner.ts` the primary TUI entrypoint.

## UX And Interaction
- Shell layout: left `tree` pane for projects/threads, center main pane for chat or project overview, right contextual pane for diff/plan, bottom terminal drawer.
- Screen model mirrors current web routes: index, thread, project overview, settings.
- Global navigation defaults: arrow keys and `h/j/k/l` navigate; `Enter` activates; `Tab` and `Shift+Tab` cycle pane focus; `:` opens the command palette; `i` enters composer edit mode; `Esc` exits edit mode or closes the active modal; `gg` and `G` jump to top/bottom; `Ctrl+G` leaves terminal capture back to shell navigation.
- Existing configurable server keybindings still apply for `chat.new`, `chat.newLocal`, `terminal.toggle`, `terminal.split`, `terminal.new`, `terminal.close`, `diff.toggle`, `editor.openFavorite`, and `script.{id}.run`.
- Composer uses Rezi `codeEditor` in plain-text mode, preserves `@path` mentions and `/model` and `/plan` slash flows, and sends on `Ctrl+Enter`.
- Attachments are supported, but not with browser gestures. The TUI uses a file-picker or typed-path flow to stage images before send.
- Approvals and user input are modal-first. Work log uses `logsConsole`. Diff view uses `diffViewer`. Project selection and attachment picking use `filePicker`. Project overview edits the same `.t3code/project-goals.json` via existing `projects.readFile` and `projects.writeFile`.
- Terminal support is a custom Rezi widget backed by backend PTY events plus an ANSI buffer/parser. Use `@xterm/headless` for buffer semantics rather than reimplementing escape handling: [npm](https://www.npmjs.com/package/@xterm/headless).

## Implementation Sequence
1. Add shared app-settings contracts, server store, WebSocket methods, and push channel.
2. Extract shared pure client/runtime logic into `packages/app-runtime` and switch the web app to import from it.
3. Replace web local-storage settings/theme hooks with server-backed hooks plus one-time migration.
4. Build the TUI supervisor and WS client, then the shared reducer/controller layer for snapshot sync, event replay, keybindings, polling, and mutations.
5. Implement the TUI shell and screens in this order: sidebar/thread list, chat/composer, approvals/user input, diff/plan pane, terminal drawer, git/worktree controls, project overview, settings.
6. Add command palette actions for add project, new thread/local thread, rename/delete thread, rename/delete project, run script, open settings, open in editor, toggle diff, and toggle terminal.

## Tests And Acceptance
- Unit tests: app-settings schema/defaulting, legacy web migration, read-model sync, keybinding resolution, composer mention/slash parsing, project-goals helpers, supervisor command resolution, and TUI focus/route reducer behavior.
- Server tests: file-backed settings store, invalid patch rejection, `appSettings.get`, `appSettings.update`, and broadcast behavior on multiple subscribers.
- TUI controller tests: thread create/delete/rename flows, worktree thread creation, approval accept/decline, user-input submit, diff toggle/revert dispatch, terminal open/split/close/focus transitions, project-goals CRUD, and shared-settings update propagation.
- Manual smoke scenarios: launch from a repo root, auto-bootstrap the cwd project, create local and worktree threads, send a prompt, handle approval/user input, open diff, revert a checkpoint, run a project script, edit settings in web and see the TUI update live, attach an image through the TUI picker/path flow, and use split terminals.
- Completion gates for implementation: `bun lint` and `bun typecheck` must pass, plus targeted `bun run test` coverage for `t3`, `@t3tools/web`, `@t3tools/tui`, and `@t3tools/app-runtime`.

## Assumptions And Defaults
- `apps/tui` is the real product surface for the terminal app. No `t3 tui` subcommand in this slice.
- Sidecar WebSocket is the only backend topology.
- Shared server-backed settings include theme and replace browser-local settings storage.
- Electron-only updater UI stays out of scope for the TUI because it is not part of the web frontend path.
- “Same frontend functionality” means capability parity and shared state semantics, not identical browser gestures or pixel layout.
