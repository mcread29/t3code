# MCP Project Planning Tools For Goals/Tasks

## Summary

Implement app-managed MCP tools that let Codex read and mutate the Project Overview planning model for goals, tasks, and subtasks, while keeping the Project Overview UI and the MCP tools on the same backend mutation path.

Default decisions locked in:
- Add stable IDs and bump the planning file schema.
- Cover goals, tasks, and subtasks in the first tool set.
- Centralize all planning reads/writes in one backend service reused by both UI and MCP.

## Current State

- The Project Overview UI stores planning data in `.t3code/project-goals.json` and mutates it client-side by loading the whole document, editing arrays by index, then writing the whole file back.
- The schema currently has no IDs, only nested arrays in [projectGoals.ts](/home/mchan/dev/t3code/apps/web/src/projectGoals.ts#L31).
- The parser/normalizer lives only in the web app in [projectGoals.ts](/home/mchan/dev/t3code/apps/web/src/projectGoals.ts#L1).
- The server already exposes generic file read/write RPC in [wsServer.ts](/home/mchan/dev/t3code/apps/server/src/wsServer.ts#L774).
- The provider stack already understands MCP tool activity, but there is no app-owned MCP server yet.

## Target Design

### 1. Shared Planning Model

Create a shared runtime module in `packages/shared/src/projectGoals.ts` and move the document schema, parsing, normalization, serialization, creation helpers, and update helpers out of `apps/web`.

Introduce schema `version: 2`:
- `ProjectGoal` gets `id`.
- `ProjectTask` gets `id`.
- `ProjectSubtask` gets `id`.
- Keep the existing nested shape so the UI structure stays recognizable.
- Keep top-level standalone `tasks` and nested `goal.tasks`.

Add v1 -> v2 migration on read:
- Reads must accept existing `version: 1` files.
- Migration assigns IDs in memory and normalizes the document.
- First successful write persists the upgraded `version: 2` document.
- Reads remain side-effect free.

### 2. Backend Project Planning Service

Add a new server service subtree, for example:
- `apps/server/src/projectPlanning/Services/ProjectPlanning.ts`
- `apps/server/src/projectPlanning/Layers/ProjectPlanning.ts`

Responsibilities:
- Resolve the target project by `projectId` or `workspaceRoot`.
- Load and parse `.t3code/project-goals.json`.
- Serialize all writes through a per-project lock to prevent lost updates within this server process.
- Expose typed CRUD operations for goals, tasks, and subtasks.
- Return `{ revision, document }` snapshots after reads and writes.
- Optionally enforce `expectedRevision` for write operations; if it mismatches, return a typed conflict error.

Revision model:
- Do not store revision in the JSON file.
- Compute revision server-side from the normalized serialized document.
- UI and MCP tools can pass `expectedRevision`; omission means “apply to latest.”

### 3. UI And MCP Share The Same Mutation Path

Replace Project Overview’s direct document write flow in [ProjectOverviewContent.tsx](/home/mchan/dev/t3code/apps/web/src/components/project-overview/ProjectOverviewContent.tsx#L617) and [projectGoalsReactQuery.ts](/home/mchan/dev/t3code/apps/web/src/lib/projectGoalsReactQuery.ts#L20) with typed backend planning RPC.

The UI should stop doing raw index-based file mutation itself. Instead:
- Query a backend `getSnapshot`.
- Call typed create/update/delete mutations.
- Update React Query from mutation results.
- Keep local UI-only concerns such as dialog state, expanded rows, and optimistic visibility.

This avoids two mutation stacks drifting apart.

### 4. Public API / Type Changes

Add new shared contracts in `packages/contracts`:
- `ProjectPlanningTarget` with `projectId?: ProjectId` and `workspaceRoot?: string`.
- `ProjectPlanningSnapshot` with `revision` and `document`.
- CRUD input/result schemas for goals, tasks, and subtasks.
- Typed error/result contracts for not found, conflict, invalid target, and invalid document.

Extend `NativeApi` in [ipc.ts](/home/mchan/dev/t3code/packages/contracts/src/ipc.ts#L98):
- `projectPlanning.getSnapshot`
- `projectPlanning.createGoal`
- `projectPlanning.updateGoal`
- `projectPlanning.deleteGoal`
- `projectPlanning.createTask`
- `projectPlanning.updateTask`
- `projectPlanning.deleteTask`
- `projectPlanning.createSubtask`
- `projectPlanning.updateSubtask`
- `projectPlanning.deleteSubtask`

Extend WebSocket RPC in `packages/contracts/src/ws.ts` with matching methods and add a push channel:
- `projectPlanning.updated`

### 5. MCP Server Surface

Add an app-owned MCP server dedicated to project planning, implemented in new files rather than inside `codexAppServerManager.ts`.

Recommended tool set:
- `project_planning_get_snapshot`
- `project_planning_create_goal`
- `project_planning_update_goal`
- `project_planning_delete_goal`
- `project_planning_create_task`
- `project_planning_update_task`
- `project_planning_delete_task`
- `project_planning_create_subtask`
- `project_planning_update_subtask`
- `project_planning_delete_subtask`

Tool input rules:
- Every tool accepts a target selector.
- Supported selectors are `projectId` or `workspaceRoot`.
- Goal/task/subtask mutations target stable IDs, never array indexes or titles.
- Mutation tools accept optional `expectedRevision`.
- Mutation responses return the updated `revision`, the updated `document`, and the changed entity ID.

Tool descriptions should explicitly instruct Codex to prefer these tools over raw editing of `.t3code/project-goals.json` when managing project planning state.

### 6. MCP Server Hosting Strategy

Implement the MCP server as a backend-owned loopback HTTP listener on an ephemeral port, not as extra app-server JSON-RPC methods.

Reason:
- Keeps Codex App Server transport separate from the custom tool host.
- Avoids exposing the MCP endpoint on the public app HTTP server.
- Avoids bolting unsupported custom request handling into [codexAppServerManager.ts](/home/mchan/dev/t3code/apps/server/src/codexAppServerManager.ts#L1185).

Add a small managed-Codex-config service:
- Start the MCP listener during server startup.
- Write a managed Codex config under `stateDir` that registers this MCP server.
- Launch `codex app-server` with that managed config via `CODEX_HOME`.
- Keep this as a small integration seam around [codexAppServerManager.ts](/home/mchan/dev/t3code/apps/server/src/codexAppServerManager.ts#L543), not a broad refactor.

### 7. Live UI Sync

When either the UI or MCP tools mutate planning data, publish `projectPlanning.updated` with:
- `projectId`
- `workspaceRoot`
- `revision`
- `updatedAt`

The Project Overview route subscribes to that push event and invalidates/refetches the active planning query if it matches the open project. This ensures the UI updates when Codex changes goals/tasks in the background.

## Implementation Sequence

1. Extract and migrate planning model code into `packages/shared`.
2. Add v2 IDs and migration logic.
3. Build `ProjectPlanningService` with typed CRUD, lock, revisioning, and tests.
4. Add WS contracts and `NativeApi` methods.
5. Refactor Project Overview and React Query to use backend planning RPC instead of raw file writes.
6. Add `projectPlanning.updated` push notifications and UI invalidation.
7. Add the dedicated MCP server and route it to `ProjectPlanningService`.
8. Add managed Codex MCP config injection so spawned Codex sessions can discover the planning tools.
9. Add end-to-end tests covering UI writes, MCP writes, and live UI refresh.

## Test Cases And Scenarios

- Shared model parses existing v1 files and upgrades them to v2 with IDs on first write.
- Shared model preserves normalization and authored subtask order.
- Backend service CRUD works for tasks, goal tasks, and subtasks.
- Backend service returns stable not-found errors for missing goal/task/subtask IDs.
- Backend service rejects conflicting `expectedRevision`.
- Backend service serializes concurrent writes to the same project without losing changes.
- WebSocket methods validate inputs and return typed errors.
- Project Overview browser tests still cover create/edit/delete flows, now through planning RPC.
- Project Overview updates when a server-side MCP mutation emits `projectPlanning.updated`.
- MCP tool integration tests verify each tool schema, success path, not-found path, and conflict path.
- `bun lint` passes.
- `bun typecheck` passes.
- If tests are executed, use `bun run test`, not `bun test`.

## Assumptions And Defaults

- Phase 1 assumes app-managed Codex sessions use the server-managed Codex config for MCP registration.
- Phase 1 does not try to support arbitrary user-managed `providerOptions.codex.homePath` merge semantics unless that path is already proven necessary during implementation.
- Goals/tasks remain file-backed in `.t3code/project-goals.json`; this plan does not move them into the orchestration database.
- Reordering and drag/drop are out of scope; CRUD plus status/field updates are in scope.
- MCP tools target stable IDs and explicit project selectors, not fuzzy title matching or array indexes.
