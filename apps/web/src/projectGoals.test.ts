import { describe, expect, it } from "vitest";

import {
  createEmptyProjectGoalsDocument,
  parseProjectGoalsDocument,
  ProjectGoalsDocumentParseError,
  serializeProjectGoalsDocument,
  groupGoalsByStatus,
  groupStandaloneTasksByStatus,
  updateGoalTaskAtIndex,
  updateStandaloneTaskAtIndex,
} from "./projectGoals";

describe("projectGoals", () => {
  it("parses a missing file to the default empty document", () => {
    expect(parseProjectGoalsDocument(null)).toEqual(createEmptyProjectGoalsDocument());
  });

  it("parses a valid document", () => {
    expect(
      parseProjectGoalsDocument(
        JSON.stringify({
          version: 1,
          goals: [{ name: "Launch", status: "planning", tasks: [] }],
          tasks: [],
        }),
      ),
    ).toEqual({
      version: 1,
      goals: [{ name: "Launch", status: "planning", tasks: [] }],
      tasks: [],
    });
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
    expect(
      serializeProjectGoalsDocument({
        version: 1,
        goals: [
          {
            name: "Beta",
            status: "planning",
            tasks: [{ title: "z", description: "", status: "planning", subtasks: [] }],
          },
          {
            name: "Alpha",
            status: "working",
            tasks: [{ title: "b", description: "", status: "working", subtasks: [] }],
          },
        ],
        tasks: [
          { title: "zebra", description: "", status: "archived", subtasks: [] },
          { title: "apple", description: "", status: "working", subtasks: [] },
        ],
      }),
    ).toBe(`{
  "version": 1,
  "goals": [
    {
      "name": "Alpha",
      "status": "working",
      "tasks": [
        {
          "title": "b",
          "description": "",
          "status": "working",
          "subtasks": []
        }
      ]
    },
    {
      "name": "Beta",
      "status": "planning",
      "tasks": [
        {
          "title": "z",
          "description": "",
          "status": "planning",
          "subtasks": []
        }
      ]
    }
  ],
  "tasks": [
    {
      "title": "apple",
      "description": "",
      "status": "working",
      "subtasks": []
    },
    {
      "title": "zebra",
      "description": "",
      "status": "archived",
      "subtasks": []
    }
  ]
}
`);
  });

  it("groups goals by status in the fixed order", () => {
    const groups = groupGoalsByStatus([
      { name: "Plan", status: "planning", tasks: [] },
      { name: "Ship", status: "working", tasks: [] },
      { name: "Archive", status: "archived", tasks: [] },
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
      { title: "Backlog", description: "", status: "planning", subtasks: [] },
      { title: "Now", description: "", status: "working", subtasks: [] },
      { title: "Done", description: "", status: "done", subtasks: [] },
    ]);

    expect(groups.map((group) => group.status)).toEqual([
      "working",
      "scheduled",
      "planning",
      "done",
      "archived",
    ]);
    expect(groups[0]?.items.map((task) => task.title)).toEqual(["Now"]);
    expect(groups[2]?.items.map((task) => task.title)).toEqual(["Backlog"]);
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

  it("updates a nested goal task path correctly", () => {
    const updated = updateGoalTaskAtIndex(
      {
        version: 1,
        goals: [
          {
            name: "Goal",
            status: "planning",
            tasks: [
              { title: "Task B", description: "", status: "planning", subtasks: [] },
              { title: "Task A", description: "", status: "planning", subtasks: [] },
            ],
          },
        ],
        tasks: [],
      },
      0,
      1,
      (task) => ({ ...task, title: "Task C" }),
    );

    expect(updated.goals[0]?.tasks.map((task) => task.title)).toEqual(["Task B", "Task C"]);
  });

  it("updates a standalone task path correctly", () => {
    const updated = updateStandaloneTaskAtIndex(
      {
        version: 1,
        goals: [],
        tasks: [
          { title: "B", description: "", status: "planning", subtasks: [] },
          { title: "A", description: "", status: "planning", subtasks: [] },
        ],
      },
      1,
      (task) => ({
        ...task,
        title: "Z",
        description: "updated",
        subtasks: [{ task: "subtask", done: false }],
      }),
    );

    expect(updated.tasks).toEqual([
      { title: "B", description: "", status: "planning", subtasks: [] },
      {
        title: "Z",
        description: "updated",
        status: "planning",
        subtasks: [{ task: "subtask", done: false }],
      },
    ]);
  });
});
