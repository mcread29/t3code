import { Schema } from "effect";
import { IsoDate, PositiveInt } from "@t3tools/contracts";

import {
  PROJECT_TASK_RECURRENCE_ORDINALS,
  PROJECT_TASK_RECURRENCE_WEEKDAYS,
  normalizeProjectTaskRecurrence,
} from "./projectTaskRecurrence";

export const PROJECT_GOALS_FILE_PATH = ".t3code/project-goals.json";

export const PROJECT_GOAL_STATUS_ORDER = [
  "working",
  "scheduled",
  "planning",
  "done",
  "archived",
] as const;

export type ProjectGoalStatus = (typeof PROJECT_GOAL_STATUS_ORDER)[number];

export const PROJECT_GOAL_STATUS_LABELS: Record<ProjectGoalStatus, string> = {
  working: "Working",
  scheduled: "Scheduled",
  planning: "Planning",
  done: "Done",
  archived: "Archived",
};

const ProjectGoalStatusSchema = Schema.Literals(PROJECT_GOAL_STATUS_ORDER);

const ProjectSubtaskSchemaV1 = Schema.Struct({
  task: Schema.String,
  done: Schema.Boolean,
});

const ProjectTaskSchemaV1 = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  status: ProjectGoalStatusSchema,
  subtasks: Schema.Array(ProjectSubtaskSchemaV1),
});

const ProjectGoalSchemaV1 = Schema.Struct({
  name: Schema.String,
  status: ProjectGoalStatusSchema,
  tasks: Schema.Array(ProjectTaskSchemaV1),
});

const ProjectGoalsDocumentSchemaV1 = Schema.Struct({
  version: Schema.Literal(1),
  goals: Schema.Array(ProjectGoalSchemaV1),
  tasks: Schema.Array(ProjectTaskSchemaV1),
});

const ProjectIdSchema = Schema.NonEmptyString;

export const ProjectSubtaskSchema = Schema.Struct({
  id: ProjectIdSchema,
  task: Schema.String,
  done: Schema.Boolean,
});
export type ProjectSubtask = typeof ProjectSubtaskSchema.Type;

export const ProjectTaskRecurrenceWeekdaySchema = Schema.Literals(
  PROJECT_TASK_RECURRENCE_WEEKDAYS,
);
export type ProjectTaskRecurrenceWeekday =
  typeof ProjectTaskRecurrenceWeekdaySchema.Type;

export const ProjectTaskRecurrenceOrdinalSchema = Schema.Literals(
  PROJECT_TASK_RECURRENCE_ORDINALS,
);
export type ProjectTaskRecurrenceOrdinal =
  typeof ProjectTaskRecurrenceOrdinalSchema.Type;

export const ProjectTaskRecurrenceRuleSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("daily"),
    interval: PositiveInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("weekly"),
    interval: PositiveInt,
    weekdays: Schema.Array(ProjectTaskRecurrenceWeekdaySchema),
  }),
  Schema.Struct({
    kind: Schema.Literal("monthly-day"),
    interval: PositiveInt,
    dayOfMonth: PositiveInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("monthly-ordinal-weekday"),
    interval: PositiveInt,
    ordinal: ProjectTaskRecurrenceOrdinalSchema,
    weekday: ProjectTaskRecurrenceWeekdaySchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("yearly-date"),
    interval: PositiveInt,
    month: PositiveInt,
    dayOfMonth: PositiveInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("yearly-ordinal-weekday"),
    interval: PositiveInt,
    month: PositiveInt,
    ordinal: ProjectTaskRecurrenceOrdinalSchema,
    weekday: ProjectTaskRecurrenceWeekdaySchema,
  }),
]);
export type ProjectTaskRecurrenceRule = typeof ProjectTaskRecurrenceRuleSchema.Type;

export const ProjectTaskRecurrenceSchema = Schema.Struct({
  startDate: IsoDate,
  rule: ProjectTaskRecurrenceRuleSchema,
  completionDates: Schema.Array(IsoDate),
});
export type ProjectTaskRecurrenceValue = typeof ProjectTaskRecurrenceSchema.Type;

export const ProjectTaskSchema = Schema.Struct({
  id: ProjectIdSchema,
  title: Schema.String,
  description: Schema.String,
  status: ProjectGoalStatusSchema,
  scheduledDate: Schema.NullOr(IsoDate),
  recurrence: Schema.NullOr(ProjectTaskRecurrenceSchema).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  subtasks: Schema.Array(ProjectSubtaskSchema),
  linkedThreadIds: Schema.Array(ProjectIdSchema),
});
export type ProjectTask = typeof ProjectTaskSchema.Type;

export const ProjectGoalSchema = Schema.Struct({
  id: ProjectIdSchema,
  name: Schema.String,
  status: ProjectGoalStatusSchema,
  tasks: Schema.Array(ProjectTaskSchema),
});
export type ProjectGoal = typeof ProjectGoalSchema.Type;

export const ProjectGoalsDocumentSchema = Schema.Struct({
  version: Schema.Literal(5),
  goals: Schema.Array(ProjectGoalSchema),
  tasks: Schema.Array(ProjectTaskSchema),
});
export type ProjectGoalsDocument = typeof ProjectGoalsDocumentSchema.Type;

type ProjectGoalsDocumentV1 = typeof ProjectGoalsDocumentSchemaV1.Type;
const ProjectTaskSchemaV2 = Schema.Struct({
  id: ProjectIdSchema,
  title: Schema.String,
  description: Schema.String,
  status: ProjectGoalStatusSchema,
  subtasks: Schema.Array(ProjectSubtaskSchema),
});
const ProjectGoalSchemaV2 = Schema.Struct({
  id: ProjectIdSchema,
  name: Schema.String,
  status: ProjectGoalStatusSchema,
  tasks: Schema.Array(ProjectTaskSchemaV2),
});
const ProjectGoalsDocumentSchemaV2 = Schema.Struct({
  version: Schema.Literal(2),
  goals: Schema.Array(ProjectGoalSchemaV2),
  tasks: Schema.Array(ProjectTaskSchemaV2),
});
type ProjectGoalsDocumentV2 = typeof ProjectGoalsDocumentSchemaV2.Type;

const ProjectTaskSchemaV3 = Schema.Struct({
  id: ProjectIdSchema,
  title: Schema.String,
  description: Schema.String,
  status: ProjectGoalStatusSchema,
  subtasks: Schema.Array(ProjectSubtaskSchema),
  linkedThreadIds: Schema.Array(ProjectIdSchema),
});
const ProjectGoalSchemaV3 = Schema.Struct({
  id: ProjectIdSchema,
  name: Schema.String,
  status: ProjectGoalStatusSchema,
  tasks: Schema.Array(ProjectTaskSchemaV3),
});
const ProjectGoalsDocumentSchemaV3 = Schema.Struct({
  version: Schema.Literal(3),
  goals: Schema.Array(ProjectGoalSchemaV3),
  tasks: Schema.Array(ProjectTaskSchemaV3),
});
type ProjectGoalsDocumentV3 = typeof ProjectGoalsDocumentSchemaV3.Type;

const ProjectTaskSchemaV4 = Schema.Struct({
  id: ProjectIdSchema,
  title: Schema.String,
  description: Schema.String,
  status: ProjectGoalStatusSchema,
  scheduledDate: Schema.NullOr(IsoDate),
  subtasks: Schema.Array(ProjectSubtaskSchema),
  linkedThreadIds: Schema.Array(ProjectIdSchema),
});
const ProjectGoalSchemaV4 = Schema.Struct({
  id: ProjectIdSchema,
  name: Schema.String,
  status: ProjectGoalStatusSchema,
  tasks: Schema.Array(ProjectTaskSchemaV4),
});
const ProjectGoalsDocumentSchemaV4 = Schema.Struct({
  version: Schema.Literal(4),
  goals: Schema.Array(ProjectGoalSchemaV4),
  tasks: Schema.Array(ProjectTaskSchemaV4),
});
type ProjectGoalsDocumentV4 = typeof ProjectGoalsDocumentSchemaV4.Type;

const ProjectGoalsDocumentSchemaAnyVersion = Schema.Union([
  ProjectGoalsDocumentSchemaV1,
  ProjectGoalsDocumentSchemaV2,
  ProjectGoalsDocumentSchemaV3,
  ProjectGoalsDocumentSchemaV4,
  ProjectGoalsDocumentSchema,
]);

export class ProjectGoalsDocumentParseError extends Error {
  override readonly name = "ProjectGoalsDocumentParseError";

  constructor(
    message: string,
    readonly reason: "invalid-json" | "invalid-schema",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface ProjectGoalsGroup<TItem> {
  status: ProjectGoalStatus;
  label: string;
  items: TItem[];
}

export type ProjectTaskLocation =
  | { scope: "standalone"; task: ProjectTask }
  | { scope: "goal"; goal: ProjectGoal; task: ProjectTask };

export type ProjectSubtaskLocation =
  | { scope: "standalone"; task: ProjectTask; subtask: ProjectSubtask }
  | { scope: "goal"; goal: ProjectGoal; task: ProjectTask; subtask: ProjectSubtask };

export type LinkedProjectTaskLocation =
  | { scope: "standalone"; task: ProjectTask }
  | { scope: "goal"; goal: ProjectGoal; task: ProjectTask };

const decodeProjectGoalsDocument = Schema.decodeUnknownSync(ProjectGoalsDocumentSchemaAnyVersion);

function createProjectPlanningId(prefix: "goal" | "task" | "subtask"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createEmptyProjectGoalsDocument(): ProjectGoalsDocument {
  return {
    version: 5,
    goals: [],
    tasks: [],
  };
}

function compareStatuses(left: ProjectGoalStatus, right: ProjectGoalStatus): number {
  return PROJECT_GOAL_STATUS_ORDER.indexOf(left) - PROJECT_GOAL_STATUS_ORDER.indexOf(right);
}

function compareByStatusAndName(
  left: { status: ProjectGoalStatus; name: string; id: string },
  right: { status: ProjectGoalStatus; name: string; id: string },
): number {
  return compareStatuses(left.status, right.status) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function compareByStatusAndTitle(
  left: { status: ProjectGoalStatus; title: string; id: string; scheduledDate: string | null },
  right: { status: ProjectGoalStatus; title: string; id: string; scheduledDate: string | null },
): number {
  const leftHasSchedule = left.scheduledDate !== null;
  const rightHasSchedule = right.scheduledDate !== null;

  return (
    compareStatuses(left.status, right.status) ||
    Number(rightHasSchedule) - Number(leftHasSchedule) ||
    (left.scheduledDate ?? "").localeCompare(right.scheduledDate ?? "") ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

function migrateSubtask(subtask: typeof ProjectSubtaskSchemaV1.Type): ProjectSubtask {
  return {
    id: createProjectPlanningId("subtask"),
    task: subtask.task,
    done: subtask.done,
  };
}

function migrateTask(task: typeof ProjectTaskSchemaV1.Type): ProjectTask {
  return {
    id: createProjectPlanningId("task"),
    title: task.title,
    description: task.description,
    status: task.status,
    scheduledDate: null,
    recurrence: null,
    subtasks: task.subtasks.map(migrateSubtask),
    linkedThreadIds: [],
  };
}

function migrateGoal(goal: typeof ProjectGoalSchemaV1.Type): ProjectGoal {
  return {
    id: createProjectPlanningId("goal"),
    name: goal.name,
    status: goal.status,
    tasks: goal.tasks.map(migrateTask),
  };
}

function migrateProjectGoalsDocumentV1(doc: ProjectGoalsDocumentV1): ProjectGoalsDocument {
  return {
    version: 5,
    goals: doc.goals.map(migrateGoal),
    tasks: doc.tasks.map(migrateTask),
  };
}

function migrateTaskV2(task: ProjectGoalsDocumentV2["tasks"][number]): ProjectTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    scheduledDate: null,
    recurrence: null,
    subtasks: task.subtasks.map(normalizeSubtask),
    linkedThreadIds: [],
  };
}

function migrateGoalV2(goal: ProjectGoalsDocumentV2["goals"][number]): ProjectGoal {
  return {
    id: goal.id,
    name: goal.name,
    status: goal.status,
    tasks: goal.tasks.map(migrateTaskV2),
  };
}

function migrateProjectGoalsDocumentV2(doc: ProjectGoalsDocumentV2): ProjectGoalsDocument {
  return {
    version: 5,
    goals: doc.goals.map(migrateGoalV2),
    tasks: doc.tasks.map(migrateTaskV2),
  };
}

function migrateTaskV3(task: ProjectGoalsDocumentV3["tasks"][number]): ProjectTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    scheduledDate: null,
    recurrence: null,
    subtasks: task.subtasks.map(normalizeSubtask),
    linkedThreadIds: task.linkedThreadIds,
  };
}

function migrateGoalV3(goal: ProjectGoalsDocumentV3["goals"][number]): ProjectGoal {
  return {
    id: goal.id,
    name: goal.name,
    status: goal.status,
    tasks: goal.tasks.map(migrateTaskV3),
  };
}

function migrateProjectGoalsDocumentV3(doc: ProjectGoalsDocumentV3): ProjectGoalsDocument {
  return {
    version: 5,
    goals: doc.goals.map(migrateGoalV3),
    tasks: doc.tasks.map(migrateTaskV3),
  };
}

function migrateTaskV4(task: ProjectGoalsDocumentV4["tasks"][number]): ProjectTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    scheduledDate: task.scheduledDate,
    recurrence: null,
    subtasks: task.subtasks.map(normalizeSubtask),
    linkedThreadIds: task.linkedThreadIds,
  };
}

function migrateGoalV4(goal: ProjectGoalsDocumentV4["goals"][number]): ProjectGoal {
  return {
    id: goal.id,
    name: goal.name,
    status: goal.status,
    tasks: goal.tasks.map(migrateTaskV4),
  };
}

function migrateProjectGoalsDocumentV4(doc: ProjectGoalsDocumentV4): ProjectGoalsDocument {
  return {
    version: 5,
    goals: doc.goals.map(migrateGoalV4),
    tasks: doc.tasks.map(migrateTaskV4),
  };
}

function normalizeSubtask(subtask: ProjectSubtask): ProjectSubtask {
  return {
    id: subtask.id,
    task: subtask.task,
    done: subtask.done,
  };
}

function normalizeTask(task: ProjectTask): ProjectTask {
  const linkedThreadIds = Array.from(
    new Set(
      task.linkedThreadIds
        .map((threadId) => threadId.trim())
        .filter((threadId) => threadId.length > 0),
    ),
  ).toSorted((left, right) => left.localeCompare(right));
  const recurrence =
    task.recurrence === null || task.recurrence === undefined
      ? null
      : normalizeProjectTaskRecurrence(task.recurrence);
  const scheduledDate = recurrence ? null : task.scheduledDate ?? null;
  if (recurrence && task.scheduledDate !== null && task.scheduledDate !== undefined) {
    throw new Error("Recurring tasks must not include a one-time scheduled date.");
  }
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    scheduledDate,
    recurrence,
    subtasks: task.subtasks.map(normalizeSubtask),
    linkedThreadIds,
  };
}

function normalizeGoal(goal: ProjectGoal): ProjectGoal {
  return {
    id: goal.id,
    name: goal.name,
    status: goal.status,
    tasks: [...goal.tasks].map(normalizeTask).toSorted(compareByStatusAndTitle),
  };
}

export function normalizeProjectGoalsDocument(doc: ProjectGoalsDocument): ProjectGoalsDocument {
  const decoded = Schema.decodeUnknownSync(ProjectGoalsDocumentSchema)(doc);
  return {
    version: 5,
    goals: [...decoded.goals].map(normalizeGoal).toSorted(compareByStatusAndName),
    tasks: [...decoded.tasks].map(normalizeTask).toSorted(compareByStatusAndTitle),
  };
}

export function parseProjectGoalsDocument(raw: string | null): ProjectGoalsDocument {
  if (raw === null) {
    return createEmptyProjectGoalsDocument();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ProjectGoalsDocumentParseError(
      "Project goals file contains invalid JSON.",
      "invalid-json",
      { cause: error },
    );
  }

  try {
    const decoded = decodeProjectGoalsDocument(parsed);
    const migrated =
      decoded.version === 1
        ? migrateProjectGoalsDocumentV1(decoded)
        : decoded.version === 2
          ? migrateProjectGoalsDocumentV2(decoded)
          : decoded.version === 3
            ? migrateProjectGoalsDocumentV3(decoded)
            : decoded.version === 4
              ? migrateProjectGoalsDocumentV4(decoded)
              : decoded;
    return normalizeProjectGoalsDocument(migrated);
  } catch (error) {
    throw new ProjectGoalsDocumentParseError(
      "Project goals file does not match the expected schema.",
      "invalid-schema",
      { cause: error },
    );
  }
}

export function serializeProjectGoalsDocument(doc: ProjectGoalsDocument): string {
  return `${JSON.stringify(normalizeProjectGoalsDocument(doc), null, 2)}\n`;
}

function groupItemsByStatus<TItem extends { status: ProjectGoalStatus }>(
  items: readonly TItem[],
  statuses: readonly ProjectGoalStatus[] = PROJECT_GOAL_STATUS_ORDER,
): Array<ProjectGoalsGroup<TItem>> {
  return statuses.map((status) => ({
    status,
    label: PROJECT_GOAL_STATUS_LABELS[status],
    items: items.filter((item) => item.status === status),
  }));
}

export function projectTaskBoardStatuses(options?: {
  includeArchived?: boolean;
}): ProjectGoalStatus[] {
  const boardStatuses: ProjectGoalStatus[] = ["planning", "scheduled", "working", "done"];

  if (options?.includeArchived) {
    return [...boardStatuses, "archived"];
  }

  return boardStatuses;
}

export function groupTaskItemsByStatus<TItem>(
  items: readonly TItem[],
  getStatus: (item: TItem) => ProjectGoalStatus,
  options?: {
    includeArchived?: boolean;
  },
): Array<ProjectGoalsGroup<TItem>> {
  const statuses = projectTaskBoardStatuses(options);
  return statuses.map((status) => ({
    status,
    label: PROJECT_GOAL_STATUS_LABELS[status],
    items: items.filter((item) => getStatus(item) === status),
  }));
}

export function groupGoalsByStatus(goals: readonly ProjectGoal[]): Array<ProjectGoalsGroup<ProjectGoal>> {
  return groupItemsByStatus(
    [...goals].map(normalizeGoal).toSorted((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
  );
}

export function groupStandaloneTasksByStatus(
  tasks: readonly ProjectTask[],
  options?: {
    includeArchived?: boolean;
  },
): Array<ProjectGoalsGroup<ProjectTask>> {
  return groupTaskItemsByStatus(
    [...tasks].map(normalizeTask).toSorted(compareByStatusAndTitle),
    (task) => task.status,
    options,
  );
}

export function createGoal(input?: Partial<ProjectGoal>): ProjectGoal {
  return normalizeGoal({
    id: input?.id ?? createProjectPlanningId("goal"),
    name: input?.name ?? "",
    status: input?.status ?? "planning",
    tasks: input?.tasks ?? [],
  });
}

export function createTask(input?: Partial<ProjectTask>): ProjectTask {
  return normalizeTask({
    id: input?.id ?? createProjectPlanningId("task"),
    title: input?.title ?? "",
    description: input?.description ?? "",
    status: input?.status ?? "planning",
    scheduledDate: input?.scheduledDate ?? null,
    recurrence: input?.recurrence ?? null,
    subtasks: input?.subtasks ?? [],
    linkedThreadIds: input?.linkedThreadIds ?? [],
  });
}

export function createSubtask(input?: Partial<ProjectSubtask>): ProjectSubtask {
  return normalizeSubtask({
    id: input?.id ?? createProjectPlanningId("subtask"),
    task: input?.task ?? "",
    done: input?.done ?? false,
  });
}

export function findGoalById(doc: ProjectGoalsDocument, goalId: string): ProjectGoal | null {
  return doc.goals.find((goal) => goal.id === goalId) ?? null;
}

export function findTaskById(doc: ProjectGoalsDocument, taskId: string): ProjectTaskLocation | null {
  const standaloneTask = doc.tasks.find((task) => task.id === taskId);
  if (standaloneTask) {
    return {
      scope: "standalone",
      task: standaloneTask,
    };
  }

  for (const goal of doc.goals) {
    const goalTask = goal.tasks.find((task) => task.id === taskId);
    if (goalTask) {
      return {
        scope: "goal",
        goal,
        task: goalTask,
      };
    }
  }

  return null;
}

export function findSubtaskById(
  doc: ProjectGoalsDocument,
  subtaskId: string,
): ProjectSubtaskLocation | null {
  for (const task of doc.tasks) {
    const subtask = task.subtasks.find((entry) => entry.id === subtaskId);
    if (subtask) {
      return {
        scope: "standalone",
        task,
        subtask,
      };
    }
  }

  for (const goal of doc.goals) {
    for (const task of goal.tasks) {
      const subtask = task.subtasks.find((entry) => entry.id === subtaskId);
      if (subtask) {
        return {
          scope: "goal",
          goal,
          task,
          subtask,
        };
      }
    }
  }

  return null;
}

export function addGoal(doc: ProjectGoalsDocument, goal: ProjectGoal): ProjectGoalsDocument {
  return normalizeProjectGoalsDocument({
    ...doc,
    goals: [...doc.goals, goal],
  });
}

export function updateGoal(
  doc: ProjectGoalsDocument,
  goalId: string,
  updater: (goal: ProjectGoal) => ProjectGoal,
): ProjectGoalsDocument | null {
  let found = false;
  const goals = doc.goals.map((goal) => {
    if (goal.id !== goalId) {
      return goal;
    }
    found = true;
    return updater(goal);
  });

  if (!found) {
    return null;
  }

  return normalizeProjectGoalsDocument({
    ...doc,
    goals,
  });
}

export function deleteGoal(doc: ProjectGoalsDocument, goalId: string): ProjectGoalsDocument | null {
  const goals = doc.goals.filter((goal) => goal.id !== goalId);
  if (goals.length === doc.goals.length) {
    return null;
  }

  return normalizeProjectGoalsDocument({
    ...doc,
    goals,
  });
}

export function addStandaloneTask(doc: ProjectGoalsDocument, task: ProjectTask): ProjectGoalsDocument {
  return normalizeProjectGoalsDocument({
    ...doc,
    tasks: [...doc.tasks, task],
  });
}

export function addTaskToGoal(
  doc: ProjectGoalsDocument,
  goalId: string,
  task: ProjectTask,
): ProjectGoalsDocument | null {
  return updateGoal(doc, goalId, (goal) => ({
    ...goal,
    tasks: [...goal.tasks, task],
  }));
}

export function updateTask(
  doc: ProjectGoalsDocument,
  taskId: string,
  updater: (task: ProjectTask) => ProjectTask,
): ProjectGoalsDocument | null {
  let found = false;

  const standaloneTasks = doc.tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }
    found = true;
    return updater(task);
  });

  if (found) {
    return normalizeProjectGoalsDocument({
      ...doc,
      tasks: standaloneTasks,
    });
  }

  const goals = doc.goals.map((goal) => ({
    ...goal,
    tasks: goal.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      found = true;
      return updater(task);
    }),
  }));

  if (!found) {
    return null;
  }

  return normalizeProjectGoalsDocument({
    ...doc,
    goals,
  });
}

export function deleteTask(doc: ProjectGoalsDocument, taskId: string): ProjectGoalsDocument | null {
  const standaloneTasks = doc.tasks.filter((task) => task.id !== taskId);
  if (standaloneTasks.length !== doc.tasks.length) {
    return normalizeProjectGoalsDocument({
      ...doc,
      tasks: standaloneTasks,
    });
  }

  let found = false;
  const goals = doc.goals.map((goal) => {
    const tasks = goal.tasks.filter((task) => task.id !== taskId);
    if (tasks.length !== goal.tasks.length) {
      found = true;
    }
    return {
      ...goal,
      tasks,
    };
  });

  if (!found) {
    return null;
  }

  return normalizeProjectGoalsDocument({
    ...doc,
    goals,
  });
}

export function attachThreadToTaskInDocument(
  doc: ProjectGoalsDocument,
  taskId: string,
  threadId: string,
): ProjectGoalsDocument | null {
  const normalizedThreadId = threadId.trim();
  if (normalizedThreadId.length === 0) {
    return null;
  }

  return updateTask(doc, taskId, (task) => ({
    ...task,
    linkedThreadIds: [...task.linkedThreadIds, normalizedThreadId],
  }));
}

export function detachThreadFromTaskInDocument(
  doc: ProjectGoalsDocument,
  taskId: string,
  threadId: string,
): ProjectGoalsDocument | null {
  const normalizedThreadId = threadId.trim();
  if (normalizedThreadId.length === 0) {
    return null;
  }

  return updateTask(doc, taskId, (task) => ({
    ...task,
    linkedThreadIds: task.linkedThreadIds.filter((entry) => entry !== normalizedThreadId),
  }));
}

export function completeTaskOccurrenceInDocument(
  doc: ProjectGoalsDocument,
  taskId: string,
  occurrenceDate: string,
): ProjectGoalsDocument | null {
  return updateTask(doc, taskId, (task) => {
    if (task.recurrence === null) {
      return task;
    }
    return {
      ...task,
      recurrence: normalizeProjectTaskRecurrence({
        ...task.recurrence,
        completionDates: [...task.recurrence.completionDates, occurrenceDate],
      }),
    };
  });
}

export function uncompleteTaskOccurrenceInDocument(
  doc: ProjectGoalsDocument,
  taskId: string,
  occurrenceDate: string,
): ProjectGoalsDocument | null {
  return updateTask(doc, taskId, (task) => {
    if (task.recurrence === null) {
      return task;
    }
    return {
      ...task,
      recurrence: normalizeProjectTaskRecurrence({
        ...task.recurrence,
        completionDates: task.recurrence.completionDates.filter(
          (entry) => entry !== occurrenceDate,
        ),
      }),
    };
  });
}

export function isThreadLinkedToTask(task: ProjectTask, threadId: string): boolean {
  const normalizedThreadId = threadId.trim();
  if (normalizedThreadId.length === 0) {
    return false;
  }

  return task.linkedThreadIds.includes(normalizedThreadId);
}

export function findTasksLinkedToThread(
  doc: ProjectGoalsDocument,
  threadId: string,
): LinkedProjectTaskLocation[] {
  const normalizedThreadId = threadId.trim();
  if (normalizedThreadId.length === 0) {
    return [];
  }

  const linkedTasks: LinkedProjectTaskLocation[] = [];
  for (const task of doc.tasks) {
    if (task.linkedThreadIds.includes(normalizedThreadId)) {
      linkedTasks.push({ scope: "standalone", task });
    }
  }

  for (const goal of doc.goals) {
    for (const task of goal.tasks) {
      if (task.linkedThreadIds.includes(normalizedThreadId)) {
        linkedTasks.push({ scope: "goal", goal, task });
      }
    }
  }

  return linkedTasks;
}

export function addSubtaskToTask(
  doc: ProjectGoalsDocument,
  taskId: string,
  subtask: ProjectSubtask,
): ProjectGoalsDocument | null {
  return updateTask(doc, taskId, (task) => ({
    ...task,
    subtasks: [...task.subtasks, subtask],
  }));
}

export function updateSubtask(
  doc: ProjectGoalsDocument,
  subtaskId: string,
  updater: (subtask: ProjectSubtask) => ProjectSubtask,
): ProjectGoalsDocument | null {
  return updateTask(doc, findTaskIdForSubtask(doc, subtaskId) ?? "", (task) => ({
    ...task,
    subtasks: task.subtasks.map((subtask) =>
      subtask.id === subtaskId ? updater(subtask) : subtask,
    ),
  }));
}

export function deleteSubtask(
  doc: ProjectGoalsDocument,
  subtaskId: string,
): ProjectGoalsDocument | null {
  return updateTask(doc, findTaskIdForSubtask(doc, subtaskId) ?? "", (task) => ({
    ...task,
    subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId),
  }));
}

export function findTaskIdForSubtask(doc: ProjectGoalsDocument, subtaskId: string): string | null {
  const location = findSubtaskById(doc, subtaskId);
  return location?.task.id ?? null;
}
