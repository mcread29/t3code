import { Schema } from "effect";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";

export const ProjectGoalStatus = Schema.Literals([
  "working",
  "scheduled",
  "planning",
  "done",
  "archived",
]);
export type ProjectGoalStatus = typeof ProjectGoalStatus.Type;

const ProjectPlanningEntityId = TrimmedNonEmptyString;

export const ProjectPlanningSubtask = Schema.Struct({
  id: ProjectPlanningEntityId,
  task: Schema.String,
  done: Schema.Boolean,
});
export type ProjectPlanningSubtask = typeof ProjectPlanningSubtask.Type;

export const ProjectPlanningTask = Schema.Struct({
  id: ProjectPlanningEntityId,
  title: Schema.String,
  description: Schema.String,
  status: ProjectGoalStatus,
  subtasks: Schema.Array(ProjectPlanningSubtask),
  linkedThreadIds: Schema.Array(TrimmedNonEmptyString),
});
export type ProjectPlanningTask = typeof ProjectPlanningTask.Type;

export const ProjectPlanningGoal = Schema.Struct({
  id: ProjectPlanningEntityId,
  name: Schema.String,
  status: ProjectGoalStatus,
  tasks: Schema.Array(ProjectPlanningTask),
});
export type ProjectPlanningGoal = typeof ProjectPlanningGoal.Type;

export const ProjectPlanningDocument = Schema.Struct({
  version: Schema.Literal(3),
  goals: Schema.Array(ProjectPlanningGoal),
  tasks: Schema.Array(ProjectPlanningTask),
});
export type ProjectPlanningDocument = typeof ProjectPlanningDocument.Type;

export const ProjectPlanningTarget = Schema.Struct({
  projectId: Schema.optional(TrimmedNonEmptyString),
  workspaceRoot: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectPlanningTarget = typeof ProjectPlanningTarget.Type;

export const ProjectPlanningSnapshot = Schema.Struct({
  revision: TrimmedNonEmptyString,
  document: ProjectPlanningDocument,
});
export type ProjectPlanningSnapshot = typeof ProjectPlanningSnapshot.Type;

export const ProjectPlanningErrorCode = Schema.Literals([
  "not_found",
  "conflict",
  "invalid_target",
  "invalid_document",
]);
export type ProjectPlanningErrorCode = typeof ProjectPlanningErrorCode.Type;

export const ProjectPlanningError = Schema.Struct({
  type: Schema.Literal("error"),
  code: ProjectPlanningErrorCode,
  message: TrimmedNonEmptyString,
  entityType: Schema.optional(
    Schema.Literals(["target", "document", "goal", "task", "subtask"]),
  ),
  entityId: Schema.optional(TrimmedNonEmptyString),
  expectedRevision: Schema.optional(TrimmedNonEmptyString),
  actualRevision: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectPlanningError = typeof ProjectPlanningError.Type;

export const ProjectPlanningSnapshotResult = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("success"),
    snapshot: ProjectPlanningSnapshot,
  }),
  ProjectPlanningError,
]);
export type ProjectPlanningSnapshotResult = typeof ProjectPlanningSnapshotResult.Type;

export const ProjectPlanningMutationResult = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("success"),
    changedId: TrimmedNonEmptyString,
    snapshot: ProjectPlanningSnapshot,
  }),
  ProjectPlanningError,
]);
export type ProjectPlanningMutationResult = typeof ProjectPlanningMutationResult.Type;

export const ProjectPlanningUpdatedPayload = Schema.Struct({
  projectId: Schema.optional(TrimmedNonEmptyString),
  workspaceRoot: TrimmedNonEmptyString,
  revision: TrimmedNonEmptyString,
  updatedAt: IsoDateTime,
});
export type ProjectPlanningUpdatedPayload = typeof ProjectPlanningUpdatedPayload.Type;

const ProjectPlanningExpectedRevision = Schema.Struct({
  expectedRevision: Schema.optional(TrimmedNonEmptyString),
});

export const ProjectPlanningGetSnapshotInput = ProjectPlanningTarget;
export type ProjectPlanningGetSnapshotInput = typeof ProjectPlanningGetSnapshotInput.Type;

export const ProjectPlanningCreateGoalInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  name: Schema.String,
  status: Schema.optional(ProjectGoalStatus),
});
export type ProjectPlanningCreateGoalInput = typeof ProjectPlanningCreateGoalInput.Type;

export const ProjectPlanningUpdateGoalInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  goalId: ProjectPlanningEntityId,
  name: Schema.optional(Schema.String),
  status: Schema.optional(ProjectGoalStatus),
});
export type ProjectPlanningUpdateGoalInput = typeof ProjectPlanningUpdateGoalInput.Type;

export const ProjectPlanningDeleteGoalInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  goalId: ProjectPlanningEntityId,
});
export type ProjectPlanningDeleteGoalInput = typeof ProjectPlanningDeleteGoalInput.Type;

export const ProjectPlanningCreateTaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  goalId: Schema.optional(ProjectPlanningEntityId),
  title: Schema.String,
  description: Schema.optional(Schema.String),
  status: Schema.optional(ProjectGoalStatus),
});
export type ProjectPlanningCreateTaskInput = typeof ProjectPlanningCreateTaskInput.Type;

export const ProjectPlanningUpdateTaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  taskId: ProjectPlanningEntityId,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  status: Schema.optional(ProjectGoalStatus),
});
export type ProjectPlanningUpdateTaskInput = typeof ProjectPlanningUpdateTaskInput.Type;

export const ProjectPlanningDeleteTaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  taskId: ProjectPlanningEntityId,
});
export type ProjectPlanningDeleteTaskInput = typeof ProjectPlanningDeleteTaskInput.Type;

export const ProjectPlanningAttachThreadToTaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  taskId: ProjectPlanningEntityId,
  threadId: TrimmedNonEmptyString,
});
export type ProjectPlanningAttachThreadToTaskInput =
  typeof ProjectPlanningAttachThreadToTaskInput.Type;

export const ProjectPlanningDetachThreadFromTaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  taskId: ProjectPlanningEntityId,
  threadId: TrimmedNonEmptyString,
});
export type ProjectPlanningDetachThreadFromTaskInput =
  typeof ProjectPlanningDetachThreadFromTaskInput.Type;

export const ProjectPlanningCreateSubtaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  taskId: ProjectPlanningEntityId,
  task: Schema.String,
  done: Schema.optional(Schema.Boolean),
});
export type ProjectPlanningCreateSubtaskInput = typeof ProjectPlanningCreateSubtaskInput.Type;

export const ProjectPlanningUpdateSubtaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  subtaskId: ProjectPlanningEntityId,
  task: Schema.optional(Schema.String),
  done: Schema.optional(Schema.Boolean),
});
export type ProjectPlanningUpdateSubtaskInput = typeof ProjectPlanningUpdateSubtaskInput.Type;

export const ProjectPlanningDeleteSubtaskInput = Schema.Struct({
  ...ProjectPlanningTarget.fields,
  ...ProjectPlanningExpectedRevision.fields,
  subtaskId: ProjectPlanningEntityId,
});
export type ProjectPlanningDeleteSubtaskInput = typeof ProjectPlanningDeleteSubtaskInput.Type;
