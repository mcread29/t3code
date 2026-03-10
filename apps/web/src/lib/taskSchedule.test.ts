import { describe, expect, it } from "vitest";

import {
  formatScheduledDate,
  getLocalIsoDate,
  getScheduledTaskLabel,
  isScheduledTaskOverdue,
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
});
