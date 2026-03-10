import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  ProjectPlanningCompleteTaskOccurrenceInput,
  ProjectPlanningCreateTaskInput,
  ProjectPlanningTask,
  ProjectPlanningUpdateTaskInput,
} from "./projectPlanning";

const decodeTask = Schema.decodeUnknownSync(ProjectPlanningTask);
const decodeCreateTaskInput = Schema.decodeUnknownSync(ProjectPlanningCreateTaskInput);
const decodeUpdateTaskInput = Schema.decodeUnknownSync(ProjectPlanningUpdateTaskInput);
const decodeCompleteOccurrenceInput = Schema.decodeUnknownSync(
  ProjectPlanningCompleteTaskOccurrenceInput,
);

describe("projectPlanning task scheduling", () => {
  it("accepts one-time scheduled dates on tasks", () => {
    const task = decodeTask({
      id: "task_1",
      title: "Task",
      description: "",
      status: "scheduled",
      scheduledDate: "2026-03-20",
      recurrence: null,
      subtasks: [],
      linkedThreadIds: [],
    });

    expect(task.scheduledDate).toBe("2026-03-20");
    expect(task.recurrence).toBeNull();
  });

  it("accepts recurring task payloads", () => {
    const task = decodeTask({
      id: "task_1",
      title: "Task",
      description: "",
      status: "working",
      scheduledDate: null,
      recurrence: {
        startDate: "2026-03-10",
        rule: {
          kind: "weekly",
          interval: 2,
          weekdays: ["monday", "wednesday"],
        },
        completionDates: ["2026-03-16"],
      },
      subtasks: [],
      linkedThreadIds: [],
    });

    expect(task.recurrence).toEqual({
      startDate: "2026-03-10",
      rule: {
        kind: "weekly",
        interval: 2,
        weekdays: ["monday", "wednesday"],
      },
      completionDates: ["2026-03-16"],
    });
  });

  it("accepts create task input with a recurrence", () => {
    const input = decodeCreateTaskInput({
      workspaceRoot: "/repo/project",
      title: "Task",
      recurrence: {
        startDate: "2026-03-10",
        rule: {
          kind: "monthly-day",
          interval: 1,
          dayOfMonth: 10,
        },
        completionDates: [],
      },
    });

    expect(input.recurrence?.rule.kind).toBe("monthly-day");
  });

  it("accepts update task input with a null recurrence", () => {
    const input = decodeUpdateTaskInput({
      workspaceRoot: "/repo/project",
      taskId: "task_1",
      recurrence: null,
      scheduledDate: null,
    });

    expect(input.recurrence).toBeNull();
    expect(input.scheduledDate).toBeNull();
  });

  it("accepts occurrence completion mutation input", () => {
    const input = decodeCompleteOccurrenceInput({
      workspaceRoot: "/repo/project",
      taskId: "task_1",
      occurrenceDate: "2026-03-20",
    });

    expect(input.occurrenceDate).toBe("2026-03-20");
  });

  it("rejects malformed recurrence dates", () => {
    expect(() =>
      decodeCreateTaskInput({
        workspaceRoot: "/repo/project",
        title: "Task",
        recurrence: {
          startDate: "03/10/2026",
          rule: {
            kind: "daily",
            interval: 1,
          },
          completionDates: [],
        },
      }),
    ).toThrow();
  });

  it("rejects malformed completion occurrence dates", () => {
    expect(() =>
      decodeCompleteOccurrenceInput({
        workspaceRoot: "/repo/project",
        taskId: "task_1",
        occurrenceDate: "03/20/2026",
      }),
    ).toThrow();
  });
});
