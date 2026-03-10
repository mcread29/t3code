import {
  formatProjectTaskRecurrenceSummary,
  getProjectTaskRecurrenceDueState,
} from "@t3tools/shared/projectTaskRecurrence";

import type { ProjectGoalStatus, ProjectTask } from "~/projectGoals";

export function formatScheduledDate(
  scheduledDate: string,
  locale?: Intl.LocalesArgument,
): string {
  const [year, month, day] = scheduledDate.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function getLocalIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isScheduledTaskOverdue(input: {
  scheduledDate: string | null;
  status: ProjectGoalStatus;
  today?: string;
}): boolean {
  if (input.scheduledDate === null) {
    return false;
  }

  if (input.status === "done" || input.status === "archived") {
    return false;
  }

  return input.scheduledDate < (input.today ?? getLocalIsoDate());
}

export function getScheduledTaskLabel(input: {
  scheduledDate: string | null;
  status: ProjectGoalStatus;
  locale?: Intl.LocalesArgument;
  today?: string;
}): string | null {
  if (input.scheduledDate === null) {
    return null;
  }

  const prefix = isScheduledTaskOverdue(input) ? "Overdue" : "Scheduled";
  return `${prefix} ${formatScheduledDate(input.scheduledDate, input.locale)}`;
}

export function getTaskNextOpenOccurrence(input: {
  task: ProjectTask;
  today?: string;
}): string | null {
  if (input.task.recurrence === null) {
    return input.task.scheduledDate;
  }

  return getProjectTaskRecurrenceDueState({
    recurrence: input.task.recurrence,
    status: input.task.status,
    today: input.today ?? getLocalIsoDate(),
  }).nextOpenOccurrence;
}

export function isTaskOverdue(input: {
  task: ProjectTask;
  today?: string;
}): boolean {
  if (input.task.recurrence !== null) {
    return (
      getProjectTaskRecurrenceDueState({
        recurrence: input.task.recurrence,
        status: input.task.status,
        today: input.today ?? getLocalIsoDate(),
      }).overdueOccurrence !== null
    );
  }

  return isScheduledTaskOverdue({
    scheduledDate: input.task.scheduledDate,
    status: input.task.status,
    ...(input.today ? { today: input.today } : {}),
  });
}

export function getTaskScheduleLabel(input: {
  task: ProjectTask;
  locale?: Intl.LocalesArgument;
  today?: string;
}): string | null {
  if (input.task.recurrence !== null) {
    const dueState = getProjectTaskRecurrenceDueState({
      recurrence: input.task.recurrence,
      status: input.task.status,
      today: input.today ?? getLocalIsoDate(),
    });
    if (dueState.nextOpenOccurrence === null) {
      return null;
    }
    const prefix = dueState.overdueOccurrence ? "Overdue" : "Next";
    return `${prefix} ${formatScheduledDate(dueState.nextOpenOccurrence, input.locale)}`;
  }

  return getScheduledTaskLabel({
    scheduledDate: input.task.scheduledDate,
    status: input.task.status,
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.today ? { today: input.today } : {}),
  });
}

export function getTaskRecurrenceSummary(task: ProjectTask): string | null {
  if (task.recurrence === null) {
    return null;
  }

  return formatProjectTaskRecurrenceSummary(task.recurrence);
}
