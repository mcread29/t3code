import { describe, expect, it } from "vitest";

import {
  attachThreadToTaskInDocument,
  createEmptyProjectGoalsDocument,
  createGoal,
  createTask,
  detachThreadFromTaskInDocument,
  findTasksLinkedToThread,
  groupGoalsByStatus,
  groupStandaloneTasksByStatus,
  isThreadLinkedToTask,
  parseProjectGoalsDocument,
  ProjectGoalsDocumentParseError,
  serializeProjectGoalsDocument,
  updateGoal,
  updateTask,
} from "./projectGoals";

describe("projectGoals", () => {
  it("parses a missing file to the default empty document", () => {
    expect(parseProjectGoalsDocument(null)).toEqual(createEmptyProjectGoalsDocument());
  });

  it("migrates v1 documents to v5 with stable ids", () => {
    const document = parseProjectGoalsDocument(
      JSON.stringify({
        version: 1,
        goals: [{ name: "Launch", status: "planning", tasks: [] }],
        tasks: [],
      }),
    );

    expect(document.version).toBe(5);
    expect(document.goals[0]?.id).toEqual(expect.any(String));
    expect(document.tasks).toEqual([]);
  });

  it("migrates v2 documents to v5 with empty linked thread ids", () => {
    const document = parseProjectGoalsDocument(
      JSON.stringify({
        version: 2,
        goals: [
          {
            id: "goal_1",
            name: "Launch",
            status: "planning",
            tasks: [
              {
                id: "task_goal_1",
                title: "Ship docs",
                description: "",
                status: "working",
                subtasks: [],
              },
            ],
          },
        ],
        tasks: [
          {
            id: "task_1",
            title: "Cleanup",
            description: "",
            status: "planning",
            subtasks: [],
          },
        ],
      }),
    );

    expect(document.version).toBe(5);
    expect(document.goals[0]?.tasks[0]?.linkedThreadIds).toEqual([]);
    expect(document.goals[0]?.tasks[0]?.scheduledDate).toBeNull();
    expect(document.goals[0]?.tasks[0]?.recurrence).toBeNull();
    expect(document.tasks[0]?.linkedThreadIds).toEqual([]);
    expect(document.tasks[0]?.scheduledDate).toBeNull();
    expect(document.tasks[0]?.recurrence).toBeNull();
  });

  it("migrates v3 documents to v5 with null scheduled dates", () => {
    const document = parseProjectGoalsDocument(
      JSON.stringify({
        version: 3,
        goals: [],
        tasks: [
          {
            id: "task_1",
            title: "Cleanup",
            description: "",
            status: "planning",
            subtasks: [],
            linkedThreadIds: [],
          },
        ],
      }),
    );

    expect(document.version).toBe(5);
    expect(document.tasks[0]?.scheduledDate).toBeNull();
    expect(document.tasks[0]?.recurrence).toBeNull();
  });

  it("rejects invalid schema shapes", () => {
    expect(() =>
      parseProjectGoalsDocument(
        JSON.stringify({
          version: 1,
          goals: [{ name: "Launch", status: "later", tasks: [] }],
          tasks: [],
        }),
      ),
    ).toThrow(ProjectGoalsDocumentParseError);
  });

  it("rejects invalid scheduled dates", () => {
    expect(() =>
      parseProjectGoalsDocument(
        JSON.stringify({
          version: 4,
          goals: [],
          tasks: [
            {
              id: "task_1",
              title: "Launch",
              description: "",
              status: "planning",
              scheduledDate: "03/10/2026",
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      ),
    ).toThrow(ProjectGoalsDocumentParseError);
  });

  it("rejects recurring tasks that also persist a one-time scheduled date", () => {
    expect(() =>
      parseProjectGoalsDocument(
        JSON.stringify({
          version: 5,
          goals: [],
          tasks: [
            {
              id: "task_1",
              title: "Launch",
              description: "",
              status: "planning",
              scheduledDate: "2026-03-10",
              recurrence: {
                startDate: "2026-03-10",
                rule: {
                  kind: "daily",
                  interval: 1,
                },
                completionDates: [],
              },
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      ),
    ).toThrow(ProjectGoalsDocumentParseError);
  });

  it("normalizes recurrence completion dates", () => {
    const task = createTask({
      id: "task_1",
      title: "Recurring",
      description: "",
      status: "planning",
      recurrence: {
        startDate: "2026-03-10",
        rule: {
          kind: "daily",
          interval: 2,
        },
        completionDates: ["2026-03-14", "2026-03-12", "2026-03-14"],
      },
    });

    expect(task.recurrence?.completionDates).toEqual(["2026-03-12", "2026-03-14"]);
    expect(task.scheduledDate).toBeNull();
  });

  it("serializes deterministically", () => {
    const alphaGoal = createGoal({
      id: "goal_alpha",
      name: "Alpha",
      status: "working",
      tasks: [createTask({ id: "task_b", title: "b", description: "", status: "working" })],
    });
    const betaGoal = createGoal({
      id: "goal_beta",
      name: "Beta",
      status: "planning",
      tasks: [createTask({ id: "task_z", title: "z", description: "", status: "planning" })],
    });

    expect(
      serializeProjectGoalsDocument({
        version: 5,
        goals: [betaGoal, alphaGoal],
        tasks: [
          createTask({
            id: "task_zebra",
            title: "zebra",
            description: "",
            status: "archived",
            scheduledDate: "2026-03-22",
          }),
          createTask({
            id: "task_apple",
            title: "apple",
            description: "",
            status: "working",
            scheduledDate: "2026-03-10",
          }),
        ],
      }),
    ).toContain('"version": 5');
  });

  it("groups goals by status in the fixed order", () => {
    const groups = groupGoalsByStatus([
      createGoal({ id: "goal_plan", name: "Plan", status: "planning" }),
      createGoal({ id: "goal_ship", name: "Ship", status: "working" }),
      createGoal({ id: "goal_archive", name: "Archive", status: "archived" }),
    ]);

    expect(groups.map((group) => group.status)).toEqual([
      "working",
      "scheduled",
      "planning",
      "done",
      "archived",
    ]);
    expect(groups[0]?.items.map((goal) => goal.name)).toEqual(["Ship"]);
    expect(groups[2]?.items.map((goal) => goal.name)).toEqual(["Plan"]);
    expect(groups[4]?.items.map((goal) => goal.name)).toEqual(["Archive"]);
  });

  it("groups tasks by status in the fixed order", () => {
    const groups = groupStandaloneTasksByStatus([
      createTask({ id: "task_backlog", title: "Backlog", description: "", status: "planning" }),
      createTask({
        id: "task_soon",
        title: "Soon",
        description: "",
        status: "scheduled",
        scheduledDate: "2026-03-11",
      }),
      createTask({ id: "task_now", title: "Now", description: "", status: "working" }),
      createTask({ id: "task_done", title: "Done", description: "", status: "done" }),
      createTask({ id: "task_archive", title: "Archive", description: "", status: "archived" }),
    ]);

    expect(groups.map((group) => group.status)).toEqual(["planning", "scheduled", "working", "done"]);
    expect(groups[0]?.items.map((task) => task.title)).toEqual(["Backlog"]);
    expect(groups[1]?.items.map((task) => task.title)).toEqual(["Soon"]);
    expect(groups[2]?.items.map((task) => task.title)).toEqual(["Now"]);
    expect(groups[3]?.items.map((task) => task.title)).toEqual(["Done"]);
  });

  it("sorts dated tasks before undated tasks within a status group", () => {
    const groups = groupStandaloneTasksByStatus([
      createTask({ id: "task_undated", title: "Undated", description: "", status: "planning" }),
      createTask({
        id: "task_later",
        title: "Later",
        description: "",
        status: "planning",
        scheduledDate: "2026-03-15",
      }),
      createTask({
        id: "task_sooner",
        title: "Sooner",
        description: "",
        status: "planning",
        scheduledDate: "2026-03-11",
      }),
    ]);

    expect(groups[0]?.items.map((task) => task.title)).toEqual(["Sooner", "Later", "Undated"]);
  });

  it("preserves authored subtask order", () => {
    const document = parseProjectGoalsDocument(
      JSON.stringify({
        version: 1,
        goals: [],
        tasks: [
          {
            title: "Task",
            description: "",
            status: "planning",
            subtasks: [
              { task: "third", done: false },
              { task: "first", done: true },
            ],
          },
        ],
      }),
    );

    expect(document.tasks[0]?.subtasks.map((subtask) => subtask.task)).toEqual(["third", "first"]);
  });

  it("normalizes linked thread ids by trimming, deduping, and sorting", () => {
    const document = parseProjectGoalsDocument(
      JSON.stringify({
        version: 4,
        goals: [],
        tasks: [
          {
            id: "task_1",
            title: "Task",
            description: "",
            status: "planning",
            scheduledDate: "2026-03-20",
            subtasks: [],
            linkedThreadIds: ["  thread-b  ", "thread-a", "thread-b"],
          },
        ],
      }),
    );

    expect(document.tasks[0]?.linkedThreadIds).toEqual(["thread-a", "thread-b"]);
    expect(document.tasks[0]?.scheduledDate).toBe("2026-03-20");
  });

  it("updates a goal by id", () => {
    const goal = createGoal({ id: "goal_1", name: "Goal", status: "planning" });
    const updated = updateGoal(
      {
        version: 5,
        goals: [goal],
        tasks: [],
      },
      "goal_1",
      (current) => ({ ...current, name: "Goal updated" }),
    );

    expect(updated?.goals[0]?.name).toBe("Goal updated");
  });

  it("updates a task by id", () => {
    const task = createTask({ id: "task_1", title: "B", description: "", status: "planning" });
    const updated = updateTask(
      {
        version: 5,
        goals: [],
        tasks: [task],
      },
      "task_1",
      (current) => ({
        ...current,
        title: "Z",
        description: "updated",
      }),
    );

    expect(updated?.tasks[0]?.title).toBe("Z");
    expect(updated?.tasks[0]?.description).toBe("updated");
  });

  it("attaches and detaches thread ids idempotently", () => {
    const document = {
      version: 5 as const,
      goals: [],
      tasks: [createTask({ id: "task_1", title: "Task", description: "", status: "planning" })],
    };

    const attached = attachThreadToTaskInDocument(document, "task_1", " thread-2 ");
    expect(attached).not.toBeNull();
    if (!attached) {
      throw new Error("Expected attach to succeed");
    }
    const attachedAgain = attachThreadToTaskInDocument(attached, "task_1", "thread-2");
    expect(attachedAgain).not.toBeNull();
    if (!attachedAgain) {
      throw new Error("Expected second attach to succeed");
    }
    const withSecondThread = attachThreadToTaskInDocument(attachedAgain, "task_1", "thread-1");
    expect(withSecondThread).not.toBeNull();
    if (!withSecondThread) {
      throw new Error("Expected second thread attach to succeed");
    }
    const detached = detachThreadFromTaskInDocument(withSecondThread, "task_1", "thread-2");
    expect(detached).not.toBeNull();
    if (!detached) {
      throw new Error("Expected detach to succeed");
    }
    const detachedAgain = detachThreadFromTaskInDocument(detached, "task_1", "thread-2");
    expect(detachedAgain).not.toBeNull();
    if (!detachedAgain) {
      throw new Error("Expected second detach to succeed");
    }

    expect(attached.tasks[0]?.linkedThreadIds).toEqual(["thread-2"]);
    expect(attachedAgain.tasks[0]?.linkedThreadIds).toEqual(["thread-2"]);
    expect(withSecondThread.tasks[0]?.linkedThreadIds).toEqual(["thread-1", "thread-2"]);
    expect(detached.tasks[0]?.linkedThreadIds).toEqual(["thread-1"]);
    expect(detachedAgain.tasks[0]?.linkedThreadIds).toEqual(["thread-1"]);
    expect(isThreadLinkedToTask(detachedAgain.tasks[0]!, "thread-1")).toBe(true);
    expect(isThreadLinkedToTask(detachedAgain.tasks[0]!, "thread-2")).toBe(false);
  });

  it("finds linked tasks for standalone and goal-scoped tasks", () => {
    const document = {
      version: 5 as const,
      goals: [
        createGoal({
          id: "goal_1",
          name: "Goal",
          status: "working",
          tasks: [
            createTask({
              id: "goal_task_1",
              title: "Goal task",
              description: "",
              status: "working",
              linkedThreadIds: ["thread-1"],
            }),
          ],
        }),
      ],
      tasks: [
        createTask({
          id: "task_1",
          title: "Standalone task",
          description: "",
          status: "planning",
          linkedThreadIds: ["thread-1"],
        }),
      ],
    };

    const linkedTasks = findTasksLinkedToThread(document, "thread-1");

    expect(linkedTasks).toHaveLength(2);
    expect(linkedTasks.map((entry) => entry.scope)).toEqual(["standalone", "goal"]);
    expect(linkedTasks.map((entry) => entry.task.id)).toEqual(["task_1", "goal_task_1"]);
  });
});
