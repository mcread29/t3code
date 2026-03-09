import { createHash } from "node:crypto";
import os from "node:os";

import type {
  ProjectPlanningError,
  ProjectPlanningMutationResult,
  ProjectPlanningSnapshot,
  ProjectPlanningSnapshotResult,
  ProjectPlanningTarget,
  ProjectPlanningUpdatedPayload,
} from "@t3tools/contracts";
import {
  addGoal,
  addStandaloneTask,
  addSubtaskToTask,
  addTaskToGoal,
  createGoal,
  createSubtask,
  createTask,
  deleteGoal,
  deleteSubtask,
  deleteTask,
  findGoalById,
  findSubtaskById,
  findTaskById,
  normalizeProjectGoalsDocument,
  parseProjectGoalsDocument,
  PROJECT_GOALS_FILE_PATH,
  serializeProjectGoalsDocument,
  updateGoal,
  updateSubtask,
  updateTask,
  type ProjectGoalsDocument,
} from "@t3tools/shared/projectGoals";
import { Effect, FileSystem, Layer, Path, PubSub, Stream } from "effect";

import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery";
import { ProjectPlanning, type ProjectPlanningShape } from "../Services/ProjectPlanning";

interface ResolvedProjectPlanningTarget {
  readonly projectId?: string;
  readonly workspaceRoot: string;
  readonly filePath: string;
}

interface LoadedProjectPlanningState extends ResolvedProjectPlanningTarget {
  readonly document: ProjectGoalsDocument;
  readonly snapshot: ProjectPlanningSnapshot;
}

function buildRevision(document: ProjectGoalsDocument): string {
  return createHash("sha256")
    .update(serializeProjectGoalsDocument(document))
    .digest("hex");
}

function buildSnapshot(document: ProjectGoalsDocument): ProjectPlanningSnapshot {
  return {
    revision: buildRevision(document),
    document,
  };
}

function errorResult(input: Omit<ProjectPlanningError, "type">): ProjectPlanningError {
  return {
    type: "error",
    ...input,
  };
}

function successSnapshot(document: ProjectGoalsDocument): ProjectPlanningSnapshotResult {
  return {
    type: "success",
    snapshot: buildSnapshot(document),
  };
}

function successMutation(
  document: ProjectGoalsDocument,
  changedId: string,
): ProjectPlanningMutationResult {
  return {
    type: "success",
    changedId,
    snapshot: buildSnapshot(document),
  };
}

function isProjectPlanningError(
  value: ResolvedProjectPlanningTarget | LoadedProjectPlanningState | ProjectPlanningError,
): value is ProjectPlanningError {
  return typeof value === "object" && value !== null && "type" in value && value.type === "error";
}

export const ProjectPlanningLive = Layer.effect(
  ProjectPlanning,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const changesPubSub = yield* PubSub.unbounded<ProjectPlanningUpdatedPayload>();
    const writeLocks = new Map<string, Promise<void>>();

    const runEffect = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect);

    const resolveTarget = async (
      target: ProjectPlanningTarget,
    ): Promise<ResolvedProjectPlanningTarget | ProjectPlanningError> => {
      if (!target.projectId && !target.workspaceRoot) {
        return errorResult({
          code: "invalid_target",
          entityType: "target",
          message: "Project planning target requires a projectId or workspaceRoot.",
        });
      }

      const snapshot = await Effect.runPromise(projectionSnapshotQuery.getSnapshot());
      let projectId = target.projectId;
      let workspaceRoot: string | undefined;

      if (projectId) {
        const project = snapshot.projects.find(
          (entry) => entry.id === projectId && entry.deletedAt === null,
        );
        if (!project) {
          return errorResult({
            code: "invalid_target",
            entityType: "target",
            entityId: projectId,
            message: `Unknown project id: ${projectId}.`,
          });
        }
        workspaceRoot = project.workspaceRoot;
      }

      if (target.workspaceRoot) {
        const normalizedWorkspaceRoot = path.resolve(
          target.workspaceRoot === "~"
            ? os.homedir()
            : target.workspaceRoot.startsWith("~/") || target.workspaceRoot.startsWith("~\\")
              ? path.join(os.homedir(), target.workspaceRoot.slice(2))
              : target.workspaceRoot,
        );
        if (workspaceRoot && workspaceRoot !== normalizedWorkspaceRoot) {
          return errorResult({
            code: "invalid_target",
            entityType: "target",
            message: "projectId and workspaceRoot refer to different projects.",
          });
        }
        workspaceRoot = normalizedWorkspaceRoot;
        if (!projectId) {
          projectId =
            snapshot.projects.find(
              (entry) =>
                entry.workspaceRoot === normalizedWorkspaceRoot && entry.deletedAt === null,
            )?.id ?? undefined;
        }
      }

      if (!workspaceRoot) {
        return errorResult({
          code: "invalid_target",
          entityType: "target",
          message: "Unable to resolve a workspace root for project planning.",
        });
      }

      const stat = await Effect.runPromise(
        fileSystem.stat(workspaceRoot).pipe(Effect.catch(() => Effect.succeed(null))),
      );
      if (!stat || stat.type !== "Directory") {
        return errorResult({
          code: "invalid_target",
          entityType: "target",
          message: `Workspace root does not exist or is not a directory: ${workspaceRoot}.`,
        });
      }

      return {
        ...(projectId ? { projectId } : {}),
        workspaceRoot,
        filePath: path.join(workspaceRoot, PROJECT_GOALS_FILE_PATH),
      };
    };

    const readState = async (
      target: ResolvedProjectPlanningTarget,
    ): Promise<LoadedProjectPlanningState | ProjectPlanningError> => {
      const exists = await Effect.runPromise(
        fileSystem.exists(target.filePath).pipe(Effect.catch(() => Effect.succeed(false))),
      );
      if (!exists) {
        const document = normalizeProjectGoalsDocument({
          version: 2,
          goals: [],
          tasks: [],
        });
        return {
          ...target,
          document,
          snapshot: buildSnapshot(document),
        };
      }

      const raw = await Effect.runPromise(
        fileSystem.readFileString(target.filePath).pipe(Effect.catch(() => Effect.succeed(null))),
      );
      if (raw === null) {
        return errorResult({
          code: "invalid_document",
          entityType: "document",
          message: `Unable to read ${PROJECT_GOALS_FILE_PATH}.`,
        });
      }

      try {
        const document = parseProjectGoalsDocument(raw);
        return {
          ...target,
          document,
          snapshot: buildSnapshot(document),
        };
      } catch (error) {
        return errorResult({
          code: "invalid_document",
          entityType: "document",
          message:
            error instanceof Error && error.message.length > 0
              ? error.message
              : `Invalid ${PROJECT_GOALS_FILE_PATH} document.`,
        });
      }
    };

    const withWriteLock = async <T>(workspaceRoot: string, run: () => Promise<T>): Promise<T> => {
      const previous = writeLocks.get(workspaceRoot) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(run);
      const tail = current.then(
        () => undefined,
        () => undefined,
      );
      writeLocks.set(workspaceRoot, tail);
      try {
        return await current;
      } finally {
        if (writeLocks.get(workspaceRoot) === tail) {
          writeLocks.delete(workspaceRoot);
        }
      }
    };

    const writeState = async (
      state: LoadedProjectPlanningState,
      document: ProjectGoalsDocument,
    ): Promise<ProjectPlanningSnapshot> => {
      const normalizedDocument = normalizeProjectGoalsDocument(document);
      await runEffect(fileSystem.makeDirectory(path.dirname(state.filePath), { recursive: true }));
      await runEffect(
        fileSystem.writeFileString(
          state.filePath,
          serializeProjectGoalsDocument(normalizedDocument),
        ),
      );

      const snapshot = buildSnapshot(normalizedDocument);
      await Effect.runPromise(
        PubSub.publish(changesPubSub, {
          ...(state.projectId ? { projectId: state.projectId } : {}),
          workspaceRoot: state.workspaceRoot,
          revision: snapshot.revision,
          updatedAt: new Date().toISOString(),
        }),
      );
      return snapshot;
    };

    const checkExpectedRevision = (
      state: LoadedProjectPlanningState,
      expectedRevision?: string,
    ): ProjectPlanningError | null => {
      if (!expectedRevision || expectedRevision === state.snapshot.revision) {
        return null;
      }
      return errorResult({
        code: "conflict",
        entityType: "document",
        message: "Project planning document changed before this mutation could be applied.",
        expectedRevision,
        actualRevision: state.snapshot.revision,
      });
    };

    const getLoadedState = async (
      target: ProjectPlanningTarget,
    ): Promise<LoadedProjectPlanningState | ProjectPlanningError> => {
      const resolved = await resolveTarget(target);
      if (isProjectPlanningError(resolved)) {
        return resolved;
      }
      return readState(resolved);
    };

    const mutate = async (
      target: ProjectPlanningTarget,
      expectedRevision: string | undefined,
      apply: (state: LoadedProjectPlanningState) => Promise<ProjectPlanningMutationResult>,
    ): Promise<ProjectPlanningMutationResult> => {
      const resolved = await resolveTarget(target);
      if (isProjectPlanningError(resolved)) {
        return resolved;
      }

      return withWriteLock(resolved.workspaceRoot, async () => {
        const state = await readState(resolved);
        if (isProjectPlanningError(state)) {
          return state;
        }
        const conflict = checkExpectedRevision(state, expectedRevision);
        if (conflict) {
          return conflict;
        }
        return apply(state);
      });
    };

    const service: ProjectPlanningShape = {
      changes: Stream.fromPubSub(changesPubSub),
      getSnapshot: (input) =>
        Effect.promise(async () => {
          const state = await getLoadedState(input);
          if (isProjectPlanningError(state)) {
            return state;
          }
          return successSnapshot(state.document);
        }),
      createGoal: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            const goal = createGoal({
              name: input.name,
              status: input.status ?? "planning",
            });
            await writeState(state, addGoal(state.document, goal));
            return successMutation(addGoal(state.document, goal), goal.id);
          }),
        ),
      updateGoal: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            if (!findGoalById(state.document, input.goalId)) {
              return errorResult({
                code: "not_found",
                entityType: "goal",
                entityId: input.goalId,
                message: `Unknown goal id: ${input.goalId}.`,
              });
            }
            const document = updateGoal(state.document, input.goalId, (goal) => ({
              ...goal,
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.status !== undefined ? { status: input.status } : {}),
            }));
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "goal",
                entityId: input.goalId,
                message: `Unknown goal id: ${input.goalId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, input.goalId);
          }),
        ),
      deleteGoal: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            const document = deleteGoal(state.document, input.goalId);
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "goal",
                entityId: input.goalId,
                message: `Unknown goal id: ${input.goalId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, input.goalId);
          }),
        ),
      createTask: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            if (input.goalId && !findGoalById(state.document, input.goalId)) {
              return errorResult({
                code: "not_found",
                entityType: "goal",
                entityId: input.goalId,
                message: `Unknown goal id: ${input.goalId}.`,
              });
            }
            const task = createTask({
              title: input.title,
              description: input.description ?? "",
              status: input.status ?? "planning",
            });
            const document = input.goalId
              ? addTaskToGoal(state.document, input.goalId, task)
              : addStandaloneTask(state.document, task);
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "goal",
                entityId: input.goalId,
                message: `Unknown goal id: ${input.goalId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, task.id);
          }),
        ),
      updateTask: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            if (!findTaskById(state.document, input.taskId)) {
              return errorResult({
                code: "not_found",
                entityType: "task",
                entityId: input.taskId,
                message: `Unknown task id: ${input.taskId}.`,
              });
            }
            const document = updateTask(state.document, input.taskId, (task) => ({
              ...task,
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.status !== undefined ? { status: input.status } : {}),
            }));
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "task",
                entityId: input.taskId,
                message: `Unknown task id: ${input.taskId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, input.taskId);
          }),
        ),
      deleteTask: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            const document = deleteTask(state.document, input.taskId);
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "task",
                entityId: input.taskId,
                message: `Unknown task id: ${input.taskId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, input.taskId);
          }),
        ),
      createSubtask: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            if (!findTaskById(state.document, input.taskId)) {
              return errorResult({
                code: "not_found",
                entityType: "task",
                entityId: input.taskId,
                message: `Unknown task id: ${input.taskId}.`,
              });
            }
            const subtask = createSubtask({
              task: input.task,
              done: input.done ?? false,
            });
            const document = addSubtaskToTask(state.document, input.taskId, subtask);
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "task",
                entityId: input.taskId,
                message: `Unknown task id: ${input.taskId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, subtask.id);
          }),
        ),
      updateSubtask: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            if (!findSubtaskById(state.document, input.subtaskId)) {
              return errorResult({
                code: "not_found",
                entityType: "subtask",
                entityId: input.subtaskId,
                message: `Unknown subtask id: ${input.subtaskId}.`,
              });
            }
            const document = updateSubtask(state.document, input.subtaskId, (subtask) => ({
              ...subtask,
              ...(input.task !== undefined ? { task: input.task } : {}),
              ...(input.done !== undefined ? { done: input.done } : {}),
            }));
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "subtask",
                entityId: input.subtaskId,
                message: `Unknown subtask id: ${input.subtaskId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, input.subtaskId);
          }),
        ),
      deleteSubtask: (input) =>
        Effect.promise(() =>
          mutate(input, input.expectedRevision, async (state) => {
            const document = deleteSubtask(state.document, input.subtaskId);
            if (!document) {
              return errorResult({
                code: "not_found",
                entityType: "subtask",
                entityId: input.subtaskId,
                message: `Unknown subtask id: ${input.subtaskId}.`,
              });
            }
            await writeState(state, document);
            return successMutation(document, input.subtaskId);
          }),
        ),
    };

    return service;
  }),
);
