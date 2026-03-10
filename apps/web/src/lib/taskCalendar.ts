import { listProjectTaskOccurrenceDatesInRange } from "@t3tools/shared/projectTaskRecurrence";

import {
  PROJECT_GOAL_STATUS_ORDER,
  type ProjectGoalsDocument,
  type ProjectGoalStatus,
} from "~/projectGoals";

import { getLocalIsoDate } from "./taskSchedule";

const DAY_IN_MS = 24 * 60 * 60 * 1_000;

export interface ProjectCalendarTaskItem {
  completed: boolean;
  goalId?: string;
  goalName?: string;
  recurring: boolean;
  scheduledDate: string;
  scope: "goal" | "standalone";
  status: ProjectGoalStatus;
  taskId: string;
  title: string;
}

export interface ProjectCalendarDay {
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isoDate: string;
  tasks: ProjectCalendarTaskItem[];
}

export interface ProjectCalendarWeek {
  days: ProjectCalendarDay[];
}

export interface ProjectCalendarMonth {
  hasScheduledTasks: boolean;
  monthLabel: string;
  today: string;
  weeks: ProjectCalendarWeek[];
}

function parseIsoDateAsUtc(isoDate: string): Date {
  const [year, month, day] = isoDate
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function toIsoDate(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addUtcDays(date: Date, offsetDays: number): Date {
  return new Date(date.getTime() + offsetDays * DAY_IN_MS);
}

function compareCalendarTaskItems(
  left: ProjectCalendarTaskItem,
  right: ProjectCalendarTaskItem,
): number {
  return (
    PROJECT_GOAL_STATUS_ORDER.indexOf(left.status) -
      PROJECT_GOAL_STATUS_ORDER.indexOf(right.status) ||
    left.title.localeCompare(right.title) ||
    left.taskId.localeCompare(right.taskId)
  );
}

export function buildProjectCalendarMonth(input: {
  document: ProjectGoalsDocument;
  locale?: Intl.LocalesArgument;
  today?: string;
}): ProjectCalendarMonth {
  const today = input.today ?? getLocalIsoDate();
  const monthKey = today.slice(0, 7);
  const firstOfMonth = parseIsoDateAsUtc(`${monthKey}-01`);
  const lastOfMonth = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  );
  const firstVisibleDay = addUtcDays(firstOfMonth, -firstOfMonth.getUTCDay());
  const lastVisibleDay = addUtcDays(lastOfMonth, 6 - lastOfMonth.getUTCDay());

  const tasksByDate = new Map<string, ProjectCalendarTaskItem[]>();

  const registerTask = (task: ProjectCalendarTaskItem) => {
    const scheduledTasks = tasksByDate.get(task.scheduledDate) ?? [];
    scheduledTasks.push(task);
    tasksByDate.set(task.scheduledDate, scheduledTasks);
  };

  for (const task of input.document.tasks) {
    if (task.recurrence !== null) {
      if (task.status === "done" || task.status === "archived") {
        continue;
      }
      const completionDates = new Set(task.recurrence.completionDates);
      for (const occurrenceDate of listProjectTaskOccurrenceDatesInRange({
        recurrence: task.recurrence,
        startDate: toIsoDate(firstVisibleDay),
        endDate: toIsoDate(lastVisibleDay),
      })) {
        const completed = completionDates.has(occurrenceDate);
        registerTask({
          completed,
          recurring: true,
          scheduledDate: occurrenceDate,
          scope: "standalone",
          status: completed ? "done" : task.status,
          taskId: task.id,
          title: task.title,
        });
      }
      continue;
    }
    if (task.scheduledDate === null || task.status === "archived") {
      continue;
    }
    registerTask({
      completed: false,
      recurring: false,
      scheduledDate: task.scheduledDate,
      scope: "standalone",
      status: task.status,
      taskId: task.id,
      title: task.title,
    });
  }

  for (const goal of input.document.goals) {
    for (const task of goal.tasks) {
      if (task.recurrence !== null) {
        if (task.status === "done" || task.status === "archived") {
          continue;
        }
        const completionDates = new Set(task.recurrence.completionDates);
        for (const occurrenceDate of listProjectTaskOccurrenceDatesInRange({
          recurrence: task.recurrence,
          startDate: toIsoDate(firstVisibleDay),
          endDate: toIsoDate(lastVisibleDay),
        })) {
          const completed = completionDates.has(occurrenceDate);
          registerTask({
            completed,
            goalId: goal.id,
            ...(goal.name.trim().length > 0 ? { goalName: goal.name } : {}),
            recurring: true,
            scheduledDate: occurrenceDate,
            scope: "goal",
            status: completed ? "done" : task.status,
            taskId: task.id,
            title: task.title,
          });
        }
        continue;
      }
      if (task.scheduledDate === null || task.status === "archived") {
        continue;
      }
      registerTask({
        completed: false,
        goalId: goal.id,
        ...(goal.name.trim().length > 0 ? { goalName: goal.name } : {}),
        recurring: false,
        scheduledDate: task.scheduledDate,
        scope: "goal",
        status: task.status,
        taskId: task.id,
        title: task.title,
      });
    }
  }

  for (const scheduledTasks of tasksByDate.values()) {
    scheduledTasks.sort(compareCalendarTaskItems);
  }

  const weeks: ProjectCalendarWeek[] = [];
  let hasScheduledTasks = false;

  for (
    let weekStart = firstVisibleDay;
    weekStart.getTime() <= lastVisibleDay.getTime();
    weekStart = addUtcDays(weekStart, 7)
  ) {
    const days: ProjectCalendarDay[] = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const day = addUtcDays(weekStart, dayOffset);
      const isoDate = toIsoDate(day);
      const scheduledTasks = tasksByDate.get(isoDate) ?? [];
      if (scheduledTasks.length > 0) {
        hasScheduledTasks = true;
      }
      days.push({
        dayOfMonth: day.getUTCDate(),
        isCurrentMonth:
          day.getUTCFullYear() === firstOfMonth.getUTCFullYear() &&
          day.getUTCMonth() === firstOfMonth.getUTCMonth(),
        isToday: isoDate === today,
        isoDate,
        tasks: scheduledTasks,
      });
    }
    weeks.push({ days });
  }

  return {
    hasScheduledTasks,
    monthLabel: new Intl.DateTimeFormat(input.locale, {
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(firstOfMonth),
    today,
    weeks,
  };
}
