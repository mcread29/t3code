import type {
  ProjectPlanningAttachThreadToTaskInput,
  ProjectPlanningCompleteTaskOccurrenceInput,
  ProjectPlanningCreateGoalInput,
  ProjectPlanningCreateSubtaskInput,
  ProjectPlanningCreateTaskInput,
  ProjectPlanningDetachThreadFromTaskInput,
  ProjectPlanningDeleteGoalInput,
  ProjectPlanningDeleteSubtaskInput,
  ProjectPlanningDeleteTaskInput,
  ProjectPlanningGetSnapshotInput,
  ProjectPlanningMutationResult,
  ProjectPlanningSnapshotResult,
  ProjectPlanningUncompleteTaskOccurrenceInput,
  ProjectPlanningUpdateGoalInput,
  ProjectPlanningUpdateSubtaskInput,
  ProjectPlanningUpdateTaskInput,
  ProjectPlanningUpdatedPayload,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect, Stream } from "effect";

export interface ProjectPlanningShape {
  readonly changes: Stream.Stream<ProjectPlanningUpdatedPayload>;
  readonly getSnapshot: (
    input: ProjectPlanningGetSnapshotInput,
  ) => Effect.Effect<ProjectPlanningSnapshotResult>;
  readonly createGoal: (
    input: ProjectPlanningCreateGoalInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly updateGoal: (
    input: ProjectPlanningUpdateGoalInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly deleteGoal: (
    input: ProjectPlanningDeleteGoalInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly createTask: (
    input: ProjectPlanningCreateTaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly updateTask: (
    input: ProjectPlanningUpdateTaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly deleteTask: (
    input: ProjectPlanningDeleteTaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly completeTaskOccurrence: (
    input: ProjectPlanningCompleteTaskOccurrenceInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly uncompleteTaskOccurrence: (
    input: ProjectPlanningUncompleteTaskOccurrenceInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly attachThreadToTask: (
    input: ProjectPlanningAttachThreadToTaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly detachThreadFromTask: (
    input: ProjectPlanningDetachThreadFromTaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly createSubtask: (
    input: ProjectPlanningCreateSubtaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly updateSubtask: (
    input: ProjectPlanningUpdateSubtaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
  readonly deleteSubtask: (
    input: ProjectPlanningDeleteSubtaskInput,
  ) => Effect.Effect<ProjectPlanningMutationResult>;
}

export class ProjectPlanning extends ServiceMap.Service<ProjectPlanning, ProjectPlanningShape>()(
  "t3/projectPlanning/Services/ProjectPlanning",
) {}
