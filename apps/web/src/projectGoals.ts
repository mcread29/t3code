import { Schema } from "effect";

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

const ProjectSubtaskSchema = Schema.Struct({
  task: Schema.String,
  done: Schema.Boolean,
});
export type ProjectSubtask = typeof ProjectSubtaskSchema.Type;

const ProjectTaskSchema = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  status: ProjectGoalStatusSchema,
  subtasks: Schema.Array(ProjectSubtaskSchema),
});
export type ProjectTask = typeof ProjectTaskSchema.Type;

const ProjectGoalSchema = Schema.Struct({
  name: Schema.String,
  status: ProjectGoalStatusSchema,
  tasks: Schema.Array(ProjectTaskSchema),
});
export type ProjectGoal = typeof ProjectGoalSchema.Type;

const ProjectGoalsDocumentSchema = Schema.Struct({
  version: Schema.Literal(1),
  goals: Schema.Array(ProjectGoalSchema),
  tasks: Schema.Array(ProjectTaskSchema),
});
export type ProjectGoalsDocument = typeof ProjectGoalsDocumentSchema.Type;

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

const decodeProjectGoalsDocument = Schema.decodeUnknownSync(ProjectGoalsDocumentSchema);

export function createEmptyProjectGoalsDocument(): ProjectGoalsDocument {
  return {
    version: 1,
    goals: [],
    tasks: [],
  };
}

function compareStatuses(left: ProjectGoalStatus, right: ProjectGoalStatus): number {
  return PROJECT_GOAL_STATUS_ORDER.indexOf(left) - PROJECT_GOAL_STATUS_ORDER.indexOf(right);
}

function normalizeSubtask(subtask: ProjectSubtask): ProjectSubtask {
  return {
    task: subtask.task,
    done: subtask.done,
  };
}

function normalizeTask(task: ProjectTask): ProjectTask {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    subtasks: task.subtasks.map(normalizeSubtask),
  };
}

function normalizeGoal(goal: ProjectGoal): ProjectGoal {
  return {
    name: goal.name,
    status: goal.status,
    tasks: [...goal.tasks]
      .map(normalizeTask)
      .toSorted((left, right) => left.title.localeCompare(right.title)),
  };
}

export function normalizeProjectGoalsDocument(doc: ProjectGoalsDocument): ProjectGoalsDocument {
  const decoded = decodeProjectGoalsDocument(doc);
  return {
    version: 1,
    goals: [...decoded.goals]
      .map(normalizeGoal)
      .toSorted(
        (left, right) =>
          compareStatuses(left.status, right.status) || left.name.localeCompare(right.name),
      ),
    tasks: [...decoded.tasks]
      .map(normalizeTask)
      .toSorted(
        (left, right) =>
          compareStatuses(left.status, right.status) || left.title.localeCompare(right.title),
      ),
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
    return normalizeProjectGoalsDocument(decodeProjectGoalsDocument(parsed));
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
): Array<ProjectGoalsGroup<TItem>> {
  return PROJECT_GOAL_STATUS_ORDER.map((status) => ({
    status,
    label: PROJECT_GOAL_STATUS_LABELS[status],
    items: items.filter((item) => item.status === status),
  }));
}

export function groupGoalsByStatus(goals: readonly ProjectGoal[]): Array<ProjectGoalsGroup<ProjectGoal>> {
  return groupItemsByStatus(
    [...goals]
      .map(normalizeGoal)
      .toSorted((left, right) => left.name.localeCompare(right.name)),
  );
}

export function groupStandaloneTasksByStatus(
  tasks: readonly ProjectTask[],
): Array<ProjectGoalsGroup<ProjectTask>> {
  return groupItemsByStatus(
    [...tasks]
      .map(normalizeTask)
      .toSorted((left, right) => left.title.localeCompare(right.title)),
  );
}

export function createGoal(input?: Partial<ProjectGoal>): ProjectGoal {
  return normalizeGoal({
    name: input?.name ?? "",
    status: input?.status ?? "planning",
    tasks: input?.tasks ?? [],
  });
}

export function createTask(input?: Partial<ProjectTask>): ProjectTask {
  return normalizeTask({
    title: input?.title ?? "",
    description: input?.description ?? "",
    status: input?.status ?? "planning",
    subtasks: input?.subtasks ?? [],
  });
}

export function createSubtask(input?: Partial<ProjectSubtask>): ProjectSubtask {
  return normalizeSubtask({
    task: input?.task ?? "",
    done: input?.done ?? false,
  });
}

function mapItemAtIndex<TItem>(
  items: readonly TItem[],
  index: number,
  updater: (item: TItem) => TItem,
): TItem[] {
  return items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));
}

export function updateGoalAtIndex(
  doc: ProjectGoalsDocument,
  goalIndex: number,
  updater: (goal: ProjectGoal) => ProjectGoal,
): ProjectGoalsDocument {
  return normalizeProjectGoalsDocument({
    ...doc,
    goals: mapItemAtIndex(doc.goals, goalIndex, updater),
  });
}

export function updateStandaloneTaskAtIndex(
  doc: ProjectGoalsDocument,
  taskIndex: number,
  updater: (task: ProjectTask) => ProjectTask,
): ProjectGoalsDocument {
  return normalizeProjectGoalsDocument({
    ...doc,
    tasks: mapItemAtIndex(doc.tasks, taskIndex, updater),
  });
}

export function updateGoalTaskAtIndex(
  doc: ProjectGoalsDocument,
  goalIndex: number,
  taskIndex: number,
  updater: (task: ProjectTask) => ProjectTask,
): ProjectGoalsDocument {
  return updateGoalAtIndex(doc, goalIndex, (goal) => ({
    ...goal,
    tasks: mapItemAtIndex(goal.tasks, taskIndex, updater),
  }));
}
