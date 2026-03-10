# Rezi TUI For T3 Code

## Summary
- Build a dedicated `apps/tui` package as the canonical TUI entrypoint, not a `t3` server subcommand. This keeps Rezi and terminal-only code out of upstream-owned server files and makes future merges materially easier.
- The TUI will start the existing backend as a local sidecar over the same WebSocket/`NativeApi` contract the web app uses today. No new server runtime mode is needed.
- Full parity target for this slice now means the current web surface: workspace home planning, per-project planning, project/thread sidebar flows, chat/composer, approvals and user input, diff/revert, in-thread plan rail, linked tasks, git/worktree and pull-request actions, project scripts, shared settings, and terminal sessions.
- Rezi has the right primitives for this: Node app runtime plus focus/keybinding guidance and widgets like `tree`, `commandPalette`, `codeEditor`, `diffViewer`, `logsConsole`, and `filePicker` from the official docs: [rezitui.dev](https://rezitui.dev/), [docs](https://rezitui.dev/docs).
- Existing seams to build on: [main.ts](/home/mchan/dev/t3code/apps/server/src/main.ts), [wsServer.ts](/home/mchan/dev/t3code/apps/server/src/wsServer.ts), [codexAppServerManager.ts](/home/mchan/dev/t3code/apps/server/src/codexAppServerManager.ts), [__root.tsx](/home/mchan/dev/t3code/apps/web/src/routes/__root.tsx), [appSettings.ts](/home/mchan/dev/t3code/apps/web/src/appSettings.ts), [useTheme.ts](/home/mchan/dev/t3code/apps/web/src/hooks/useTheme.ts), [projectGoals.ts](/home/mchan/dev/t3code/apps/web/src/projectGoals.ts).

## Current UI Baseline
- The shared shell is now a persistent left workspace sidebar with four top-level route surfaces under it: home planning at `/`, thread chat at `/$threadId`, project planning at `/project/$projectId`, and settings at `/settings`.
- `/` is no longer a blank index or chat landing page. It is a root planning view tied to the current workspace/home directory and reuses the same planning layout as project overviews.
- The sidebar is more operational than before: sortable and collapsible projects, per-project overview and new-thread actions, thread rows with relative timestamps, pending approval and user-input status pills, PR state, terminal activity, rename flows, selection ranges, and bulk delete.
- The thread screen is richer than the original note assumed: header-level linked-task chips, project scripts, open-in-editor actions, git quick actions, branch and worktree controls, pull-request checkout flow, inline attachment handling, pending approval and pending user-input composer states, and plan follow-up actions.
- Diff and planning are separate surfaces now. Diff is a dedicated right panel or sheet on the thread route; the active plan is a separate in-chat right rail with step tracking plus copy, download, and save actions.
- Terminal sessions live in a bottom drawer with persisted height, multiple groups, split panes, per-thread state, and keyboard shortcuts for toggle, split, new, and close.
- Project planning is broader than a simple overview page: home/project planning sidebars, calendar and standalone-task sections, goal sections, kanban grouping by status, create/edit/archive/delete flows, subtasks, and thread linking or thread creation from tasks.
- Settings currently expose theme, Codex binary and `CODEX_HOME` overrides, custom model slugs, assistant streaming, keybindings file access, confirm-before-delete, and app version info.

## Public APIs And Types
- Add `packages/contracts/src/appSettings.ts` with the shared persisted settings schema. It should match the current web settings surface plus theme: `theme`, `codexBinaryPath`, `codexHomePath`, `confirmThreadDelete`, `enableAssistantStreaming`, and `customCodexModels`.
- Extend [ipc.ts](/home/mchan/dev/t3code/packages/contracts/src/ipc.ts) `NativeApi` with `appSettings.get()`, `appSettings.update(patch)`, and `appSettings.onUpdated(listener)`.
- Extend [ws.ts](/home/mchan/dev/t3code/packages/contracts/src/ws.ts) with `appSettings.get`, `appSettings.update`, and `appSettings.updated`.
- Keep server startup/public CLI stable. The TUI will pass explicit flags to the existing server process instead of adding `mode=tui`.

## Architecture
- Add `packages/app-runtime` for cross-frontend runtime logic with explicit subpath exports. Move or extract the pure pieces currently trapped in `apps/web`: read-model sync, session/activity derivation, keybinding resolution, composer mention/slash parsing, proposed-plan helpers, thread-selection behavior, task-thread linking, project-goals helpers, project-script helpers, markdown/terminal link parsing, worktree cleanup helpers, and settings normalization.
- Add a server-side `AppSettingsStore` service under `apps/server/src/appSettings/` backed by `${stateDir}/app-settings.json`. Use schema validation plus defaulting; reject invalid patches; broadcast `appSettings.updated` after successful writes.
- Migrate web settings from local storage to the server-backed store. On first boot, if server settings are still defaults and legacy browser values exist, import them once, then stop reading the local keys. Theme moves into the same shared store.
- Add `apps/tui` with `src/index.ts`, `src/serverSupervisor.ts`, `src/nativeApiClient.ts`, `src/state/`, `src/screens/`, and `src/widgets/`.
- The TUI supervisor starts the server child in `process.cwd()` with `--mode web --no-browser --host 127.0.0.1 --port <allocated> --auth-token <random> --auto-bootstrap-project-from-cwd --state-dir <resolved>`, waits for the welcome/snapshot handshake, and tears the child down on TUI exit.
- Codex `app-server` launch behavior stays in the backend. The TUI does not launch Codex directly; it preserves the existing project/worktree `cwd` behavior already owned by [codexAppServerManager.ts](/home/mchan/dev/t3code/apps/server/src/codexAppServerManager.ts).
- `apps/tui` owns only TUI-specific rendering and controllers. All transport/state semantics stay shared through contracts and `packages/app-runtime`.
- Add root scripts `dev:tui`, `build:tui`, and `start:tui`. Do not make `scripts/dev-runner.ts` the primary TUI entrypoint.

## UX And Interaction
- Shell layout should mirror the current web information architecture: left workspace sidebar, center route content, dedicated diff surface on the thread route, separate plan rail within chat, and bottom terminal drawer.
- Screen model mirrors current web routes: home planning index, thread route with diff search state, project planning route with `goalId` and `taskId` deep links, and settings.
- The left sidebar needs first-class support for workspace tasks/home navigation, sortable and collapsible projects, per-project overview and new-thread actions, thread row status badges, PR/terminal indicators, rename flows, selection ranges, and bulk thread delete.
- The thread screen needs parity for the current header and composer surfaces: branch/worktree mode and base-branch selection, checkout-from-PR flow, linked-task chips and attach/unlink flows, project scripts, git actions, open-in-editor actions, provider/model/runtime controls, attachments, pending approvals, pending user-input flows, and plan follow-up actions such as refine and implement-in-new-thread.
- Global navigation defaults: arrow keys and `h/j/k/l` navigate; `Enter` activates; `Tab` and `Shift+Tab` cycle pane focus; `:` opens the command palette; `i` enters composer edit mode; `Esc` exits edit mode or closes the active modal; `gg` and `G` jump to top/bottom; `Ctrl+G` leaves terminal capture back to shell navigation.
- Existing configurable server keybindings still apply for `chat.new`, `chat.newLocal`, `terminal.toggle`, `terminal.split`, `terminal.new`, `terminal.close`, `diff.toggle`, `editor.openFavorite`, and `script.{id}.run`.
- Composer uses Rezi `codeEditor` in plain-text mode, preserves `@path` mentions and `/model` and `/plan` slash flows, and sends on `Ctrl+Enter`.
- Attachments are supported, but not with browser gestures. The TUI uses a file-picker or typed-path flow to stage images before send.
- Approvals and user input should follow the current web model and stay composer-adjacent first, with modal fallback only where the TUI interaction model needs it. Work log uses `logsConsole`. Diff view uses `diffViewer`. Project selection, PR selection, and attachment picking use `filePicker` or typed input. Project overview edits the same `.t3code/project-goals.json` via existing `projects.readFile` and `projects.writeFile`.
- Planning screens need parity with the current home/project overview layout: calendar section when available, standalone tasks, goal-specific views, goal/task create and edit flows, archive and filter flows, subtasks, and attach-or-create-thread actions from tasks.
- Diff parity means the current web behavior, not a generic patch viewer: all-turns vs single-turn selection, turn chips with timestamps, stacked vs split rendering, empty states, and open-in-editor actions from file headers.
- Plan parity means a separate right rail with active step tracking plus copy, download, and save-to-workspace actions for proposed plan markdown.
- Terminal support is a custom Rezi widget backed by backend PTY events plus an ANSI buffer/parser. Use `@xterm/headless` for buffer semantics rather than reimplementing escape handling: [npm](https://www.npmjs.com/package/@xterm/headless).

## Implementation Sequence
1. Add shared app-settings contracts, server store, WebSocket methods, and push channel.
2. Extract shared pure client/runtime logic into `packages/app-runtime` and switch the web app to import from it.
3. Replace web local-storage settings/theme hooks with server-backed hooks plus one-time migration.
4. Build the TUI supervisor and WS client, then the shared reducer/controller layer for snapshot sync, event replay, keybindings, polling, and mutations.
5. Implement the TUI shell and screens in this order: workspace sidebar, home planning, thread chat/composer, approvals and user input, diff surface, plan rail, terminal drawer, git/worktree and PR controls, project planning, settings.
6. Add command palette actions for add project, open home tasks, open project overview, new thread and new local thread, rename and delete thread, rename and delete project, attach or unlink task, run script, checkout PR, open settings, open in editor, toggle diff, toggle plan rail, and toggle terminal.

## Tests And Acceptance
- Unit tests: app-settings schema/defaulting, legacy web migration, read-model sync, keybinding resolution, composer mention/slash parsing, project-goals helpers, supervisor command resolution, and TUI focus/route reducer behavior.
- Server tests: file-backed settings store, invalid patch rejection, `appSettings.get`, `appSettings.update`, and broadcast behavior on multiple subscribers.
- TUI controller tests: project sidebar reorder and collapse flows, thread create/delete/rename flows, selection-range and bulk-delete behavior, worktree thread creation, PR checkout flow, linked-task attach/unlink flows, approval accept/decline, user-input submit, diff toggle/revert dispatch, plan-rail actions, terminal open/split/close/focus transitions, project-goals CRUD, and shared-settings update propagation.
- Manual smoke scenarios: launch from a repo root, auto-bootstrap the cwd project, open the home planning view, open a project overview, create local and worktree threads, create a thread from a task, send a prompt, handle approval and user input, open diff, save a proposed plan, revert a checkpoint, run a project script, prepare a thread from a PR, edit settings in web and see the TUI update live, attach an image through the TUI picker/path flow, and use split terminals.
- Completion gates for implementation: `bun lint` and `bun typecheck` must pass, plus targeted `bun run test` coverage for `t3`, `@t3tools/web`, `@t3tools/tui`, and `@t3tools/app-runtime`.

## Assumptions And Defaults
- `apps/tui` is the real product surface for the terminal app. No `t3 tui` subcommand in this slice.
- Sidecar WebSocket is the only backend topology.
- Shared server-backed settings include theme and replace browser-local settings storage.
- Electron-only updater UI stays out of scope for the TUI because it is not part of the web frontend path.
- “Same frontend functionality” now explicitly includes the split between home planning, project planning, thread chat, diff surface, plan rail, and bottom terminal drawer. It means capability parity and shared state semantics, not identical browser gestures or pixel layout.
