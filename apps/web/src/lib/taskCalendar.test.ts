import { describe, expect, it } from "vitest";

import type { ProjectGoalsDocument } from "~/projectGoals";

import { buildProjectCalendarMonth } from "./taskCalendar";

function emptyDocument(): ProjectGoalsDocument {
  return {
    version: 5,
    goals: [],
    tasks: [],
  };
}

function getCalendarDay(document: ProjectGoalsDocument, isoDate: string, today: string) {
  const calendar = buildProjectCalendarMonth({ document, today });
  const day = calendar.weeks
    .flatMap((week) => week.days)
    .find((entry) => entry.isoDate === isoDate);

  expect(day).toBeDefined();
  return day;
}

describe("taskCalendar", () => {
  it("uses visible weeks that start on Sunday when the month starts on Sunday", () => {
    const calendar = buildProjectCalendarMonth({
      document: emptyDocument(),
      today: "2026-03-10",
    });

    expect(calendar.monthLabel).toBe("March 2026");
    expect(calendar.weeks).toHaveLength(5);
    expect(calendar.weeks[0]?.days[0]?.isoDate).toBe("2026-03-01");
    expect(calendar.weeks[4]?.days[6]?.isoDate).toBe("2026-04-04");
  });

  it("includes leading and trailing adjacent-month days when the month starts mid-week", () => {
    const calendar = buildProjectCalendarMonth({
      document: emptyDocument(),
      today: "2026-04-15",
    });

    expect(calendar.weeks).toHaveLength(5);
    expect(calendar.weeks[0]?.days[0]?.isoDate).toBe("2026-03-29");
    expect(calendar.weeks[4]?.days[6]?.isoDate).toBe("2026-05-02");
    expect(calendar.weeks[0]?.days[0]?.isCurrentMonth).toBe(false);
    expect(calendar.weeks[0]?.days[3]?.isCurrentMonth).toBe(true);
  });

  it("renders six visible week rows for months that span six calendar weeks", () => {
    const calendar = buildProjectCalendarMonth({
      document: emptyDocument(),
      today: "2026-05-10",
    });

    expect(calendar.weeks).toHaveLength(6);
    expect(calendar.weeks[0]?.days[0]?.isoDate).toBe("2026-04-26");
    expect(calendar.weeks[5]?.days[6]?.isoDate).toBe("2026-06-06");
  });

  it("handles leap-year February in the visible month grid", () => {
    const calendar = buildProjectCalendarMonth({
      document: emptyDocument(),
      today: "2024-02-10",
    });

    expect(calendar.weeks).toHaveLength(5);
    expect(calendar.weeks[0]?.days[0]?.isoDate).toBe("2024-01-28");
    expect(calendar.weeks[4]?.days[6]?.isoDate).toBe("2024-03-02");
    expect(getCalendarDay(emptyDocument(), "2024-02-29", "2024-02-10")?.dayOfMonth).toBe(29);
  });

  it("groups standalone and goal tasks by scheduled date, excluding archived tasks", () => {
    const document: ProjectGoalsDocument = {
      version: 5,
      goals: [
        {
          id: "goal_1",
          name: "Launch beta",
          status: "working",
          tasks: [
            {
              id: "task_goal_done",
              title: "Write release notes",
              description: "",
              status: "done",
              scheduledDate: "2026-03-20",
              recurrence: null,
              subtasks: [],
              linkedThreadIds: [],
            },
            {
              id: "task_goal_archived",
              title: "Old release notes",
              description: "",
              status: "archived",
              scheduledDate: "2026-03-20",
              recurrence: null,
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        },
      ],
      tasks: [
        {
          id: "task_working",
          title: "Ship patch",
          description: "",
          status: "working",
          scheduledDate: "2026-03-20",
          recurrence: null,
          subtasks: [],
          linkedThreadIds: [],
        },
        {
          id: "task_planning",
          title: "Plan QA sweep",
          description: "",
          status: "planning",
          scheduledDate: "2026-03-20",
          recurrence: null,
          subtasks: [],
          linkedThreadIds: [],
        },
      ],
    };

    const day = getCalendarDay(document, "2026-03-20", "2026-03-10");

    expect(day?.tasks.map((task) => task.title)).toEqual([
      "Ship patch",
      "Plan QA sweep",
      "Write release notes",
    ]);
    expect(day?.tasks.every((task) => task.title !== "Old release notes")).toBe(true);
    expect(day?.tasks[2]?.goalName).toBe("Launch beta");
  });

  it("shows adjacent-month scheduled tasks when they are inside the visible week range", () => {
    const document: ProjectGoalsDocument = {
      version: 5,
      goals: [],
      tasks: [
        {
          id: "task_adjacent",
          title: "Finish carryover work",
          description: "",
          status: "scheduled",
          scheduledDate: "2026-03-30",
          recurrence: null,
          subtasks: [],
          linkedThreadIds: [],
        },
      ],
    };

    const calendar = buildProjectCalendarMonth({
      document,
      today: "2026-04-10",
    });
    const day = calendar.weeks
      .flatMap((week) => week.days)
      .find((entry) => entry.isoDate === "2026-03-30");

    expect(day?.isCurrentMonth).toBe(false);
    expect(day?.tasks.map((task) => task.title)).toEqual(["Finish carryover work"]);
    expect(calendar.hasScheduledTasks).toBe(true);
  });

  it("projects recurring task occurrences and marks completed occurrences as done", () => {
    const document: ProjectGoalsDocument = {
      version: 5,
      goals: [],
      tasks: [
        {
          id: "task_recurring",
          title: "Pay rent",
          description: "",
          status: "working",
          scheduledDate: null,
          recurrence: {
            startDate: "2026-03-01",
            rule: {
              kind: "weekly",
              interval: 1,
              weekdays: ["sunday"],
            },
            completionDates: ["2026-03-08"],
          },
          subtasks: [],
          linkedThreadIds: [],
        },
      ],
    };

    const firstSunday = getCalendarDay(document, "2026-03-01", "2026-03-10");
    const secondSunday = getCalendarDay(document, "2026-03-08", "2026-03-10");

    expect(firstSunday?.tasks[0]).toMatchObject({
      title: "Pay rent",
      recurring: true,
      completed: false,
      status: "working",
    });
    expect(secondSunday?.tasks[0]).toMatchObject({
      title: "Pay rent",
      recurring: true,
      completed: true,
      status: "done",
    });
  });
});
