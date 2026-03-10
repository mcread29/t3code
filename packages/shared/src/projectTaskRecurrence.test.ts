import { describe, expect, it } from "vitest";

import {
  formatProjectTaskRecurrenceSummary,
  getNextProjectTaskOccurrenceOnOrAfter,
  getProjectTaskRecurrenceDueState,
  listProjectTaskOccurrenceDatesInRange,
  normalizeProjectTaskRecurrence,
} from "./projectTaskRecurrence";

describe("projectTaskRecurrence", () => {
  it("normalizes and dedupes completion dates", () => {
    expect(
      normalizeProjectTaskRecurrence({
        startDate: "2026-03-10",
        rule: {
          kind: "daily",
          interval: 2,
        },
        completionDates: ["2026-03-14", "2026-03-12", "2026-03-14"],
      }).completionDates,
    ).toEqual(["2026-03-12", "2026-03-14"]);
  });

  it("rejects start dates that do not match the rule", () => {
    expect(() =>
      normalizeProjectTaskRecurrence({
        startDate: "2026-03-10",
        rule: {
          kind: "weekly",
          interval: 1,
          weekdays: ["monday"],
        },
        completionDates: [],
      }),
    ).toThrow("start date");
  });

  it("lists weekly occurrences inside a range", () => {
    expect(
      listProjectTaskOccurrenceDatesInRange({
        recurrence: {
          startDate: "2026-03-09",
          rule: {
            kind: "weekly",
            interval: 1,
            weekdays: ["monday", "wednesday"],
          },
        },
        startDate: "2026-03-09",
        endDate: "2026-03-20",
      }),
    ).toEqual(["2026-03-09", "2026-03-11", "2026-03-16", "2026-03-18"]);
  });

  it("skips missing monthly day-of-month occurrences", () => {
    expect(
      getNextProjectTaskOccurrenceOnOrAfter(
        {
          startDate: "2026-01-31",
          rule: {
            kind: "monthly-day",
            interval: 1,
            dayOfMonth: 31,
          },
        },
        "2026-02-01",
      ),
    ).toBe("2026-03-31");
  });

  it("skips non-leap years for yearly date recurrences", () => {
    expect(
      getNextProjectTaskOccurrenceOnOrAfter(
        {
          startDate: "2024-02-29",
          rule: {
            kind: "yearly-date",
            interval: 1,
            month: 2,
            dayOfMonth: 29,
          },
        },
        "2025-01-01",
      ),
    ).toBe("2028-02-29");
  });

  it("finds overdue recurring occurrences", () => {
    expect(
      getProjectTaskRecurrenceDueState({
        recurrence: {
          startDate: "2026-03-03",
          rule: {
            kind: "weekly",
            interval: 1,
            weekdays: ["tuesday"],
          },
          completionDates: ["2026-03-03"],
        },
        status: "working",
        today: "2026-03-17",
      }),
    ).toEqual({
      nextOpenOccurrence: "2026-03-10",
      overdueOccurrence: "2026-03-10",
    });
  });

  it("formats recurrence summaries", () => {
    expect(
      formatProjectTaskRecurrenceSummary({
        rule: {
          kind: "yearly-ordinal-weekday",
          interval: 1,
          month: 3,
          ordinal: "first",
          weekday: "monday",
        },
      }),
    ).toBe("Every year on the first Mon of March");
  });
});
