import { describe, expect, it } from "vitest";

import {
  formatScheduledDate,
  getLocalIsoDate,
  getScheduledTaskLabel,
  getTaskRecurrenceSummary,
  getTaskScheduleLabel,
  isScheduledTaskOverdue,
  isTaskOverdue,
} from "./taskSchedule";

describe("taskSchedule", () => {
  it("formats scheduled dates without timezone drift", () => {
    expect(formatScheduledDate("2026-03-20", "en-US")).toBe("Mar 20, 2026");
  });

  it("builds a local ISO date string", () => {
    expect(getLocalIsoDate(new Date(2026, 2, 10, 15, 30))).toBe("2026-03-10");
  });

  it("detects overdue scheduled tasks", () => {
    expect(
      isScheduledTaskOverdue({
        scheduledDate: "2026-03-09",
        status: "planning",
        today: "2026-03-10",
      }),
    ).toBe(true);
    expect(
      isScheduledTaskOverdue({
        scheduledDate: "2026-03-09",
        status: "done",
        today: "2026-03-10",
      }),
    ).toBe(false);
  });

  it("renders scheduled and overdue labels", () => {
    expect(
      getScheduledTaskLabel({
        scheduledDate: "2026-03-20",
        status: "planning",
        locale: "en-US",
        today: "2026-03-10",
      }),
    ).toBe("Scheduled Mar 20, 2026");
    expect(
      getScheduledTaskLabel({
        scheduledDate: "2026-03-09",
        status: "planning",
        locale: "en-US",
        today: "2026-03-10",
      }),
    ).toBe("Overdue Mar 9, 2026");
  });

  it("renders recurring task labels and summaries", () => {
    const task = {
      id: "task_1",
      title: "Backup",
      description: "",
      status: "working" as const,
      scheduledDate: null,
      recurrence: {
        startDate: "2026-03-10",
        rule: {
          kind: "weekly" as const,
          interval: 1,
          weekdays: ["tuesday"] as const,
        },
        completionDates: [],
      },
      subtasks: [],
      linkedThreadIds: [],
    };

    expect(
      getTaskScheduleLabel({
        task,
        locale: "en-US",
        today: "2026-03-10",
      }),
    ).toBe("Next Mar 10, 2026");
    expect(getTaskRecurrenceSummary(task)).toBe("Every week on Tue");
    expect(isTaskOverdue({ task, today: "2026-03-11" })).toBe(true);
  });
});
