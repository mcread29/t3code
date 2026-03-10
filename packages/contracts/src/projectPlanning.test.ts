import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  ProjectPlanningCreateTaskInput,
  ProjectPlanningTask,
  ProjectPlanningUpdateTaskInput,
} from "./projectPlanning";

const decodeTask = Schema.decodeUnknownSync(ProjectPlanningTask);
const decodeCreateTaskInput = Schema.decodeUnknownSync(ProjectPlanningCreateTaskInput);
const decodeUpdateTaskInput = Schema.decodeUnknownSync(ProjectPlanningUpdateTaskInput);

describe("projectPlanning task scheduling", () => {
  it("accepts valid scheduled dates on tasks", () => {
    const task = decodeTask({
      id: "task_1",
      title: "Task",
      description: "",
      status: "scheduled",
      scheduledDate: "2026-03-20",
      subtasks: [],
      linkedThreadIds: [],
    });

    expect(task.scheduledDate).toBe("2026-03-20");
  });

  it("accepts create task input with a scheduled date", () => {
    const input = decodeCreateTaskInput({
      workspaceRoot: "/repo/project",
      title: "Task",
      scheduledDate: "2026-03-20",
    });

    expect(input.scheduledDate).toBe("2026-03-20");
  });

  it("accepts update task input with a null scheduled date", () => {
    const input = decodeUpdateTaskInput({
      workspaceRoot: "/repo/project",
      taskId: "task_1",
      scheduledDate: null,
    });

    expect(input.scheduledDate).toBeNull();
  });

  it("accepts update task input without a scheduled date", () => {
    const input = decodeUpdateTaskInput({
      workspaceRoot: "/repo/project",
      taskId: "task_1",
      title: "Renamed",
    });

    expect(input.scheduledDate).toBeUndefined();
  });

  it("rejects malformed scheduled dates", () => {
    expect(() =>
      decodeUpdateTaskInput({
        workspaceRoot: "/repo/project",
        taskId: "task_1",
        scheduledDate: "03/20/2026",
      }),
    ).toThrow();
  });
});
