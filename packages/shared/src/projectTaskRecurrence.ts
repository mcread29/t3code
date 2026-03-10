import type { IsoDate } from "@t3tools/contracts";

const DAY_IN_MS = 24 * 60 * 60 * 1_000;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const PROJECT_TASK_RECURRENCE_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type ProjectTaskRecurrenceWeekday =
  (typeof PROJECT_TASK_RECURRENCE_WEEKDAYS)[number];

export const PROJECT_TASK_RECURRENCE_ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "last",
] as const;
export type ProjectTaskRecurrenceOrdinal =
  (typeof PROJECT_TASK_RECURRENCE_ORDINALS)[number];

export interface ProjectTaskRecurrenceDailyRule {
  kind: "daily";
  interval: number;
}

export interface ProjectTaskRecurrenceWeeklyRule {
  kind: "weekly";
  interval: number;
  weekdays: readonly ProjectTaskRecurrenceWeekday[];
}

export interface ProjectTaskRecurrenceMonthlyDayRule {
  kind: "monthly-day";
  interval: number;
  dayOfMonth: number;
}

export interface ProjectTaskRecurrenceMonthlyOrdinalWeekdayRule {
  kind: "monthly-ordinal-weekday";
  interval: number;
  ordinal: ProjectTaskRecurrenceOrdinal;
  weekday: ProjectTaskRecurrenceWeekday;
}

export interface ProjectTaskRecurrenceYearlyDateRule {
  kind: "yearly-date";
  interval: number;
  month: number;
  dayOfMonth: number;
}

export interface ProjectTaskRecurrenceYearlyOrdinalWeekdayRule {
  kind: "yearly-ordinal-weekday";
  interval: number;
  month: number;
  ordinal: ProjectTaskRecurrenceOrdinal;
  weekday: ProjectTaskRecurrenceWeekday;
}

export type ProjectTaskRecurrenceRule =
  | ProjectTaskRecurrenceDailyRule
  | ProjectTaskRecurrenceWeeklyRule
  | ProjectTaskRecurrenceMonthlyDayRule
  | ProjectTaskRecurrenceMonthlyOrdinalWeekdayRule
  | ProjectTaskRecurrenceYearlyDateRule
  | ProjectTaskRecurrenceYearlyOrdinalWeekdayRule;

export interface ProjectTaskRecurrence {
  startDate: IsoDate;
  rule: ProjectTaskRecurrenceRule;
  completionDates: readonly IsoDate[];
}

export interface ProjectTaskRecurrenceDueState {
  nextOpenOccurrence: IsoDate | null;
  overdueOccurrence: IsoDate | null;
}

function parseIsoDateAsUtc(isoDate: IsoDate): Date {
  const [year, month, day] = isoDate
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (toIsoDate(date) !== isoDate) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return date;
}

function toIsoDate(date: Date): IsoDate {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as IsoDate;
}

function addUtcDays(date: Date, offsetDays: number): Date {
  return new Date(date.getTime() + offsetDays * DAY_IN_MS);
}

function addIsoDateDays(isoDate: IsoDate, offsetDays: number): IsoDate {
  return toIsoDate(addUtcDays(parseIsoDateAsUtc(isoDate), offsetDays));
}

function dayDiff(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_IN_MS);
}

function startOfUtcWeek(date: Date): Date {
  return addUtcDays(date, -date.getUTCDay());
}

function monthsBetween(startDate: Date, endDate: Date): number {
  return (
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    (endDate.getUTCMonth() - startDate.getUTCMonth())
  );
}

function weekdayIndex(weekday: ProjectTaskRecurrenceWeekday): number {
  return PROJECT_TASK_RECURRENCE_WEEKDAYS.indexOf(weekday);
}

function normalizeInterval(interval: number): number {
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error(`Recurrence interval must be a positive integer. Received: ${interval}`);
  }
  return interval;
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function weekdayLabel(weekday: ProjectTaskRecurrenceWeekday): string {
  return weekday.slice(0, 3).replace(/^./, (value) => value.toUpperCase());
}

function ordinalLabel(ordinal: ProjectTaskRecurrenceOrdinal): string {
  return ordinal;
}

function dayOfMonthSuffix(dayOfMonth: number): string {
  const normalized = dayOfMonth % 100;
  if (normalized >= 11 && normalized <= 13) {
    return `${dayOfMonth}th`;
  }
  switch (dayOfMonth % 10) {
    case 1:
      return `${dayOfMonth}st`;
    case 2:
      return `${dayOfMonth}nd`;
    case 3:
      return `${dayOfMonth}rd`;
    default:
      return `${dayOfMonth}th`;
  }
}

function monthLabel(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Month ${month}`;
}

function getOrdinalWeekdayDateForMonth(input: {
  year: number;
  monthIndex: number;
  ordinal: ProjectTaskRecurrenceOrdinal;
  weekday: ProjectTaskRecurrenceWeekday;
}): Date | null {
  const targetWeekday = weekdayIndex(input.weekday);
  if (targetWeekday < 0) {
    throw new Error(`Unknown weekday: ${input.weekday}`);
  }

  if (input.ordinal === "last") {
    const lastDayOfMonth = new Date(Date.UTC(input.year, input.monthIndex + 1, 0));
    const offset = (lastDayOfMonth.getUTCDay() - targetWeekday + 7) % 7;
    return addUtcDays(lastDayOfMonth, -offset);
  }

  const firstDayOfMonth = new Date(Date.UTC(input.year, input.monthIndex, 1));
  const offset = (targetWeekday - firstDayOfMonth.getUTCDay() + 7) % 7;
  const firstMatch = 1 + offset;
  const ordinalIndex = PROJECT_TASK_RECURRENCE_ORDINALS.indexOf(input.ordinal);
  const dayOfMonth = firstMatch + ordinalIndex * 7;
  if (dayOfMonth > daysInUtcMonth(input.year, input.monthIndex)) {
    return null;
  }
  return new Date(Date.UTC(input.year, input.monthIndex, dayOfMonth));
}

function normalizeWeekdays(
  weekdays: readonly ProjectTaskRecurrenceWeekday[],
): ProjectTaskRecurrenceWeekday[] {
  const normalized = Array.from(new Set(weekdays)).toSorted(
    (left, right) => weekdayIndex(left) - weekdayIndex(right),
  );
  if (normalized.length === 0) {
    throw new Error("Weekly recurrence rules must include at least one weekday.");
  }
  return normalized;
}

function normalizeRule(rule: ProjectTaskRecurrenceRule): ProjectTaskRecurrenceRule {
  switch (rule.kind) {
    case "daily":
      return {
        kind: "daily",
        interval: normalizeInterval(rule.interval),
      };
    case "weekly":
      return {
        kind: "weekly",
        interval: normalizeInterval(rule.interval),
        weekdays: normalizeWeekdays(rule.weekdays),
      };
    case "monthly-day":
      if (!Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31) {
        throw new Error(`Monthly recurrence day must be between 1 and 31. Received: ${rule.dayOfMonth}`);
      }
      return {
        kind: "monthly-day",
        interval: normalizeInterval(rule.interval),
        dayOfMonth: rule.dayOfMonth,
      };
    case "monthly-ordinal-weekday":
      return {
        kind: "monthly-ordinal-weekday",
        interval: normalizeInterval(rule.interval),
        ordinal: rule.ordinal,
        weekday: rule.weekday,
      };
    case "yearly-date":
      if (!Number.isInteger(rule.month) || rule.month < 1 || rule.month > 12) {
        throw new Error(`Yearly recurrence month must be between 1 and 12. Received: ${rule.month}`);
      }
      if (!Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31) {
        throw new Error(`Yearly recurrence day must be between 1 and 31. Received: ${rule.dayOfMonth}`);
      }
      return {
        kind: "yearly-date",
        interval: normalizeInterval(rule.interval),
        month: rule.month,
        dayOfMonth: rule.dayOfMonth,
      };
    case "yearly-ordinal-weekday":
      if (!Number.isInteger(rule.month) || rule.month < 1 || rule.month > 12) {
        throw new Error(`Yearly recurrence month must be between 1 and 12. Received: ${rule.month}`);
      }
      return {
        kind: "yearly-ordinal-weekday",
        interval: normalizeInterval(rule.interval),
        month: rule.month,
        ordinal: rule.ordinal,
        weekday: rule.weekday,
      };
  }
}

export function isProjectTaskOccurrenceDate(
  recurrence: Pick<ProjectTaskRecurrence, "startDate" | "rule">,
  occurrenceDate: IsoDate,
): boolean {
  const normalizedRule = normalizeRule(recurrence.rule);
  const startDate = parseIsoDateAsUtc(recurrence.startDate);
  const candidateDate = parseIsoDateAsUtc(occurrenceDate);

  if (candidateDate.getTime() < startDate.getTime()) {
    return false;
  }

  switch (normalizedRule.kind) {
    case "daily": {
      return dayDiff(startDate, candidateDate) % normalizedRule.interval === 0;
    }
    case "weekly": {
      if (!normalizedRule.weekdays.includes(PROJECT_TASK_RECURRENCE_WEEKDAYS[candidateDate.getUTCDay()]!)) {
        return false;
      }
      const startWeek = startOfUtcWeek(startDate);
      const candidateWeek = startOfUtcWeek(candidateDate);
      const diffWeeks = dayDiff(startWeek, candidateWeek) / 7;
      return Number.isInteger(diffWeeks) && diffWeeks % normalizedRule.interval === 0;
    }
    case "monthly-day": {
      if (candidateDate.getUTCDate() !== normalizedRule.dayOfMonth) {
        return false;
      }
      const diffMonths = monthsBetween(startDate, candidateDate);
      return diffMonths >= 0 && diffMonths % normalizedRule.interval === 0;
    }
    case "monthly-ordinal-weekday": {
      const ordinalDate = getOrdinalWeekdayDateForMonth({
        year: candidateDate.getUTCFullYear(),
        monthIndex: candidateDate.getUTCMonth(),
        ordinal: normalizedRule.ordinal,
        weekday: normalizedRule.weekday,
      });
      if (!ordinalDate || ordinalDate.getTime() !== candidateDate.getTime()) {
        return false;
      }
      const diffMonths = monthsBetween(startDate, candidateDate);
      return diffMonths >= 0 && diffMonths % normalizedRule.interval === 0;
    }
    case "yearly-date": {
      if (
        candidateDate.getUTCMonth() + 1 !== normalizedRule.month ||
        candidateDate.getUTCDate() !== normalizedRule.dayOfMonth
      ) {
        return false;
      }
      const diffYears = candidateDate.getUTCFullYear() - startDate.getUTCFullYear();
      return diffYears >= 0 && diffYears % normalizedRule.interval === 0;
    }
    case "yearly-ordinal-weekday": {
      if (candidateDate.getUTCMonth() + 1 !== normalizedRule.month) {
        return false;
      }
      const ordinalDate = getOrdinalWeekdayDateForMonth({
        year: candidateDate.getUTCFullYear(),
        monthIndex: candidateDate.getUTCMonth(),
        ordinal: normalizedRule.ordinal,
        weekday: normalizedRule.weekday,
      });
      if (!ordinalDate || ordinalDate.getTime() !== candidateDate.getTime()) {
        return false;
      }
      const diffYears = candidateDate.getUTCFullYear() - startDate.getUTCFullYear();
      return diffYears >= 0 && diffYears % normalizedRule.interval === 0;
    }
  }
}

export function normalizeProjectTaskRecurrence(
  recurrence: ProjectTaskRecurrence,
): ProjectTaskRecurrence {
  const rule = normalizeRule(recurrence.rule);
  parseIsoDateAsUtc(recurrence.startDate);
  if (!isProjectTaskOccurrenceDate({ startDate: recurrence.startDate, rule }, recurrence.startDate)) {
    throw new Error("Recurring task start date must be a valid occurrence for its rule.");
  }

  const completionDates = Array.from(new Set(recurrence.completionDates)).toSorted();
  for (const completionDate of completionDates) {
    parseIsoDateAsUtc(completionDate);
    if (completionDate < recurrence.startDate) {
      throw new Error("Recurring task completion dates must be on or after the start date.");
    }
    if (
      !isProjectTaskOccurrenceDate(
        { startDate: recurrence.startDate, rule },
        completionDate,
      )
    ) {
      throw new Error("Recurring task completion dates must match the recurrence rule.");
    }
  }

  return {
    startDate: recurrence.startDate,
    rule,
    completionDates,
  };
}

export function getNextProjectTaskOccurrenceOnOrAfter(
  recurrence: Pick<ProjectTaskRecurrence, "startDate" | "rule">,
  onOrAfter: IsoDate,
): IsoDate {
  const normalizedRule = normalizeRule(recurrence.rule);
  const earliestDate = parseIsoDateAsUtc(
    onOrAfter < recurrence.startDate ? recurrence.startDate : onOrAfter,
  );
  const startDate = parseIsoDateAsUtc(recurrence.startDate);

  switch (normalizedRule.kind) {
    case "daily": {
      if (earliestDate.getTime() <= startDate.getTime()) {
        return recurrence.startDate;
      }
      const diffDays = dayDiff(startDate, earliestDate);
      const steps = Math.ceil(diffDays / normalizedRule.interval);
      return toIsoDate(addUtcDays(startDate, steps * normalizedRule.interval));
    }
    case "weekly": {
      const sortedWeekdays = normalizeWeekdays(normalizedRule.weekdays).map(weekdayIndex);
      const startWeek = startOfUtcWeek(startDate);
      const earliestWeek = startOfUtcWeek(earliestDate);
      let weekOffset = Math.max(0, dayDiff(startWeek, earliestWeek) / 7);
      const remainder = weekOffset % normalizedRule.interval;
      if (remainder !== 0) {
        weekOffset += normalizedRule.interval - remainder;
      }

      for (let attempts = 0; attempts < 512; attempts += 1) {
        const weekStart = addUtcDays(startWeek, weekOffset * 7);
        for (const weekday of sortedWeekdays) {
          const candidate = addUtcDays(weekStart, weekday);
          const candidateIso = toIsoDate(candidate);
          if (candidateIso < recurrence.startDate || candidateIso < onOrAfter) {
            continue;
          }
          return candidateIso;
        }
        weekOffset += normalizedRule.interval;
      }
      break;
    }
    case "monthly-day": {
      let monthOffset = Math.max(0, monthsBetween(startDate, earliestDate));
      const remainder = monthOffset % normalizedRule.interval;
      if (remainder !== 0) {
        monthOffset += normalizedRule.interval - remainder;
      }

      for (let attempts = 0; attempts < 512; attempts += 1) {
        const candidateYear = startDate.getUTCFullYear();
        const candidateMonthIndex = startDate.getUTCMonth() + monthOffset;
        const candidateDate = new Date(Date.UTC(candidateYear, candidateMonthIndex, 1));
        const year = candidateDate.getUTCFullYear();
        const monthIndex = candidateDate.getUTCMonth();
        if (normalizedRule.dayOfMonth <= daysInUtcMonth(year, monthIndex)) {
          const candidateIso = toIsoDate(
            new Date(Date.UTC(year, monthIndex, normalizedRule.dayOfMonth)),
          );
          if (candidateIso >= recurrence.startDate && candidateIso >= onOrAfter) {
            return candidateIso;
          }
        }
        monthOffset += normalizedRule.interval;
      }
      break;
    }
    case "monthly-ordinal-weekday": {
      let monthOffset = Math.max(0, monthsBetween(startDate, earliestDate));
      const remainder = monthOffset % normalizedRule.interval;
      if (remainder !== 0) {
        monthOffset += normalizedRule.interval - remainder;
      }

      for (let attempts = 0; attempts < 512; attempts += 1) {
        const candidateMonth = new Date(
          Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + monthOffset, 1),
        );
        const candidate = getOrdinalWeekdayDateForMonth({
          year: candidateMonth.getUTCFullYear(),
          monthIndex: candidateMonth.getUTCMonth(),
          ordinal: normalizedRule.ordinal,
          weekday: normalizedRule.weekday,
        });
        const candidateIso = candidate ? toIsoDate(candidate) : null;
        if (candidateIso && candidateIso >= recurrence.startDate && candidateIso >= onOrAfter) {
          return candidateIso;
        }
        monthOffset += normalizedRule.interval;
      }
      break;
    }
    case "yearly-date": {
      let yearOffset = Math.max(0, earliestDate.getUTCFullYear() - startDate.getUTCFullYear());
      const remainder = yearOffset % normalizedRule.interval;
      if (remainder !== 0) {
        yearOffset += normalizedRule.interval - remainder;
      }

      for (let attempts = 0; attempts < 512; attempts += 1) {
        const year = startDate.getUTCFullYear() + yearOffset;
        if (normalizedRule.dayOfMonth <= daysInUtcMonth(year, normalizedRule.month - 1)) {
          const candidateIso = toIsoDate(
            new Date(Date.UTC(year, normalizedRule.month - 1, normalizedRule.dayOfMonth)),
          );
          if (candidateIso >= recurrence.startDate && candidateIso >= onOrAfter) {
            return candidateIso;
          }
        }
        yearOffset += normalizedRule.interval;
      }
      break;
    }
    case "yearly-ordinal-weekday": {
      let yearOffset = Math.max(0, earliestDate.getUTCFullYear() - startDate.getUTCFullYear());
      const remainder = yearOffset % normalizedRule.interval;
      if (remainder !== 0) {
        yearOffset += normalizedRule.interval - remainder;
      }

      for (let attempts = 0; attempts < 512; attempts += 1) {
        const candidate = getOrdinalWeekdayDateForMonth({
          year: startDate.getUTCFullYear() + yearOffset,
          monthIndex: normalizedRule.month - 1,
          ordinal: normalizedRule.ordinal,
          weekday: normalizedRule.weekday,
        });
        const candidateIso = candidate ? toIsoDate(candidate) : null;
        if (candidateIso && candidateIso >= recurrence.startDate && candidateIso >= onOrAfter) {
          return candidateIso;
        }
        yearOffset += normalizedRule.interval;
      }
      break;
    }
  }

  throw new Error("Unable to compute the next recurring task occurrence.");
}

export function listProjectTaskOccurrenceDatesInRange(input: {
  recurrence: Pick<ProjectTaskRecurrence, "startDate" | "rule">;
  startDate: IsoDate;
  endDate: IsoDate;
}): IsoDate[] {
  if (input.endDate < input.startDate) {
    return [];
  }

  const occurrences: IsoDate[] = [];
  let nextOccurrence = getNextProjectTaskOccurrenceOnOrAfter(
    input.recurrence,
    input.startDate,
  );
  while (nextOccurrence <= input.endDate) {
    occurrences.push(nextOccurrence);
    nextOccurrence = getNextProjectTaskOccurrenceOnOrAfter(
      input.recurrence,
      addIsoDateDays(nextOccurrence, 1),
    );
  }

  return occurrences;
}

export function getProjectTaskRecurrenceDueState(input: {
  recurrence: ProjectTaskRecurrence;
  status: "working" | "scheduled" | "planning" | "done" | "archived";
  today: IsoDate;
}): ProjectTaskRecurrenceDueState {
  if (input.status === "done" || input.status === "archived") {
    return {
      nextOpenOccurrence: null,
      overdueOccurrence: null,
    };
  }

  const recurrence = normalizeProjectTaskRecurrence(input.recurrence);
  const completedOccurrences = new Set(recurrence.completionDates);
  let earliestOpenCandidate = recurrence.startDate;

  for (let attempts = 0; attempts <= recurrence.completionDates.length + 512; attempts += 1) {
    const occurrence = getNextProjectTaskOccurrenceOnOrAfter(recurrence, earliestOpenCandidate);
    if (!completedOccurrences.has(occurrence)) {
      return {
        nextOpenOccurrence: occurrence,
        overdueOccurrence: occurrence < input.today ? occurrence : null,
      };
    }
    earliestOpenCandidate = addIsoDateDays(occurrence, 1);
  }

  throw new Error("Unable to determine the next open recurring task occurrence.");
}

export function formatProjectTaskRecurrenceSummary(
  recurrence: Pick<ProjectTaskRecurrence, "rule">,
): string {
  const rule = normalizeRule(recurrence.rule);

  switch (rule.kind) {
    case "daily":
      return rule.interval === 1 ? "Every day" : `Every ${rule.interval} days`;
    case "weekly": {
      const dayList = normalizeWeekdays(rule.weekdays).map(weekdayLabel).join(", ");
      return rule.interval === 1
        ? `Every week on ${dayList}`
        : `Every ${rule.interval} weeks on ${dayList}`;
    }
    case "monthly-day":
      return rule.interval === 1
        ? `Every month on the ${dayOfMonthSuffix(rule.dayOfMonth)}`
        : `Every ${rule.interval} months on the ${dayOfMonthSuffix(rule.dayOfMonth)}`;
    case "monthly-ordinal-weekday":
      return rule.interval === 1
        ? `Every month on the ${ordinalLabel(rule.ordinal)} ${weekdayLabel(rule.weekday)}`
        : `Every ${rule.interval} months on the ${ordinalLabel(rule.ordinal)} ${weekdayLabel(rule.weekday)}`;
    case "yearly-date": {
      const dateLabel = `${monthLabel(rule.month)} ${dayOfMonthSuffix(rule.dayOfMonth)}`;
      return rule.interval === 1
        ? `Every year on ${dateLabel}`
        : `Every ${rule.interval} years on ${dateLabel}`;
    }
    case "yearly-ordinal-weekday": {
      const recurrenceLabel = `${ordinalLabel(rule.ordinal)} ${weekdayLabel(rule.weekday)} of ${monthLabel(rule.month)}`;
      return rule.interval === 1
        ? `Every year on the ${recurrenceLabel}`
        : `Every ${rule.interval} years on the ${recurrenceLabel}`;
    }
  }
}
