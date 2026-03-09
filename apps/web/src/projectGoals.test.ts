import { describe, expect, it } from "vitest";

import {
  createEmptyProjectGoalsDocument,
  createGoal,
  createTask,
  groupGoalsByStatus,
  groupStandaloneTasksByStatus,
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

  it("migrates v1 documents to v2 with stable ids", () => {
    const document = parseProjectGoalsDocument(
      JSON.stringify({
        version: 1,
        goals: [{ name: "Launch", status: "planning", tasks: [] }],
        tasks: [],
      }),
    );

    expect(document.version).toBe(2);
    expect(document.goals[0]?.id).toEqual(expect.any(String));
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
        version: 2,
        goals: [betaGoal, alphaGoal],
        tasks: [
          createTask({ id: "task_zebra", title: "zebra", description: "", status: "archived" }),
          createTask({ id: "task_apple", title: "apple", description: "", status: "working" }),
        ],
      }),
    ).toContain('"version": 2');
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

  it("groups standalone tasks by status in the fixed order", () => {
    const groups = groupStandaloneTasksByStatus([
      createTask({ id: "task_backlog", title: "Backlog", description: "", status: "planning" }),
      createTask({ id: "task_soon", title: "Soon", description: "", status: "scheduled" }),
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

  it("updates a goal by id", () => {
    const goal = createGoal({ id: "goal_1", name: "Goal", status: "planning" });
    const updated = updateGoal(
      {
        version: 2,
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
        version: 2,
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
});
