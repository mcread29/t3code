import type { ProjectGoalStatus } from "~/projectGoals";

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
