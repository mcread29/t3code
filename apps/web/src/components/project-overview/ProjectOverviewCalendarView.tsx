import type { ProjectGoalsDocument } from "~/projectGoals";
import { cn } from "~/lib/utils";
import {
  buildProjectCalendarMonth,
  type ProjectCalendarTaskItem,
} from "~/lib/taskCalendar";
import { Checkbox } from "../ui/checkbox";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function calendarTaskClassName(status: ProjectCalendarTaskItem["status"]): string {
  switch (status) {
    case "working":
      return "border-blue-200 bg-blue-50 text-blue-950";
    case "scheduled":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "planning":
      return "border-slate-200 bg-slate-50 text-slate-950";
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "archived":
      return "border-muted bg-muted text-muted-foreground";
  }
}

export default function ProjectOverviewCalendarView({
  document,
  onOpenTask,
  onCompleteOccurrence,
  onUncompleteOccurrence,
}: {
  document: ProjectGoalsDocument;
  onOpenTask: (task: ProjectCalendarTaskItem) => void;
  onCompleteOccurrence: (taskId: string, occurrenceDate: string) => Promise<void>;
  onUncompleteOccurrence: (taskId: string, occurrenceDate: string) => Promise<void>;
}) {
  const calendar = buildProjectCalendarMonth({ document });

  return (
    <section className="space-y-4" data-testid="project-calendar-view">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">{calendar.monthLabel}</h2>
        <p className="text-sm text-muted-foreground">
          All scheduled tasks for every week that touches this month.
        </p>
        {!calendar.hasScheduledTasks ? (
          <p className="text-sm text-muted-foreground">No scheduled tasks this month.</p>
        ) : null}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[52rem] rounded-2xl border border-border bg-card/80 shadow-sm">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="border-r border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="divide-y divide-border">
            {calendar.weeks.map((week) => (
              <div key={week.days[0]?.isoDate ?? "week"} className="grid grid-cols-7">
                {week.days.map((day) => (
                  <div
                    key={day.isoDate}
                    className={cn(
                      "min-h-44 border-r border-border px-3 py-3 last:border-r-0",
                      day.isCurrentMonth ? "bg-card/60" : "bg-muted/20",
                    )}
                    data-current-month={day.isCurrentMonth}
                    data-testid={`calendar-day-${day.isoDate}`}
                    data-today={day.isToday}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full text-sm font-medium",
                          day.isToday
                            ? "bg-foreground text-background"
                            : day.isCurrentMonth
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {day.dayOfMonth}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {day.tasks.map((task) => (
                        <div
                          key={task.taskId}
                          className={cn(
                            "rounded-xl border px-2.5 py-2 text-xs transition-colors",
                            calendarTaskClassName(task.status),
                          )}
                        >
                          {task.recurring ? (
                            <div className="flex items-start gap-2">
                              <Checkbox
                                aria-label={`Mark ${task.title || "Untitled task"} on ${task.scheduledDate} complete`}
                                checked={task.completed}
                                className={cn(
                                  "mt-0.5 bg-background",
                                  task.completed
                                    ? "border-emerald-400/80"
                                    : "border-sky-500/80 shadow-[0_0_0_1px_rgb(14_165_233_/_0.12)]",
                                )}
                                onCheckedChange={(checked) =>
                                  void (checked
                                    ? onCompleteOccurrence(task.taskId, task.scheduledDate)
                                    : onUncompleteOccurrence(task.taskId, task.scheduledDate))
                                }
                              />
                              <button
                                className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 rounded-lg text-left outline-hidden ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
                                onClick={() => onOpenTask(task)}
                                title={task.title || "Untitled task"}
                                type="button"
                              >
                                <span className="w-full truncate font-medium">
                                  {task.title || "Untitled task"}
                                </span>
                                {task.goalName ? (
                                  <span className="w-full truncate text-[11px] opacity-75">
                                    {task.goalName}
                                  </span>
                                ) : null}
                              </button>
                            </div>
                          ) : (
                            <button
                              className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-lg text-left outline-hidden ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
                              onClick={() => onOpenTask(task)}
                              title={task.title || "Untitled task"}
                              type="button"
                            >
                              <span className="w-full truncate font-medium">
                                {task.title || "Untitled task"}
                              </span>
                              {task.goalName ? (
                                <span className="w-full truncate text-[11px] opacity-75">
                                  {task.goalName}
                                </span>
                              ) : null}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
