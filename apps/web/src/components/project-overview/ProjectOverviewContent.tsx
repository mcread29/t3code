import type { ProjectId } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  PROJECT_TASK_RECURRENCE_ORDINALS,
  PROJECT_TASK_RECURRENCE_WEEKDAYS,
} from "@t3tools/shared/projectTaskRecurrence";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import React from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { ensureNativeApi } from "~/nativeApi";
import {
  createEmptyProjectGoalsDocument,
  groupTaskItemsByStatus,
  PROJECT_GOAL_STATUS_LABELS,
  projectTaskBoardStatuses,
  type ProjectGoal,
  type ProjectGoalStatus,
  ProjectGoalsDocumentParseError,
  type ProjectTask,
  type ProjectTaskRecurrence,
  type ProjectTaskRecurrenceOrdinal,
  type ProjectTaskRecurrenceWeekday,
} from "~/projectGoals";
import { useStore } from "~/store";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "~/types";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  projectPlanningQueryKeys,
  projectPlanningSnapshotQueryOptions,
  ProjectPlanningRpcError,
  unwrapMutationResult,
} from "~/lib/projectGoalsReactQuery";
import {
  formatScheduledDate,
  getLocalIsoDate,
  getTaskNextOpenOccurrence,
  getTaskRecurrenceSummary,
  getTaskScheduleLabel,
  isTaskOverdue,
} from "~/lib/taskSchedule";
import {
  buildTaskKickoffPrompt,
  buildTaskThreadTitle,
  getTaskThreadCandidates,
  presentLinkedThreads,
  type LinkedThreadPresentation,
  type TaskThreadCandidate,
} from "~/lib/taskThreadLinks";
import type { ProjectCalendarTaskItem } from "~/lib/taskCalendar";
import ProjectOverviewCalendarView from "./ProjectOverviewCalendarView";
import TaskKanbanBoard from "./TaskKanbanBoard";
import type { ProjectOverviewSection } from "./ProjectOverviewLayout";
import { newThreadId } from "~/lib/utils";

type GoalEditorState =
  | { mode: "create" }
  | {
      mode: "edit";
      goalId: string;
      goal: ProjectGoal;
    };

type TaskEditorState =
  | { mode: "create"; scope: "standalone" }
  | {
      mode: "create";
      scope: "goal";
      goalId: string;
    }
  | {
      mode: "edit";
      scope: "standalone";
      taskId: string;
      task: ProjectTask;
    }
  | {
      mode: "edit";
      scope: "goal";
      goalId: string;
      taskId: string;
      task: ProjectTask;
    };

type TaskThreadDialogTask =
  | {
      taskId: string;
      task: ProjectTask;
      goalId?: string;
      goalName?: string;
    };

type TaskScheduleMode = "none" | "one-time" | "recurring";
type TaskRecurrenceRuleKind =
  | "daily"
  | "weekly"
  | "monthly-day"
  | "monthly-ordinal-weekday"
  | "yearly-date"
  | "yearly-ordinal-weekday";

interface TaskRecurrenceDraft {
  startDate: string;
  ruleKind: TaskRecurrenceRuleKind;
  interval: number;
  weekdays: readonly ProjectTaskRecurrenceWeekday[];
  dayOfMonth: number;
  ordinal: ProjectTaskRecurrenceOrdinal;
  weekday: ProjectTaskRecurrenceWeekday;
  month: number;
}

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

function parseTaskEditorIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function taskEditorWeekdayForDate(isoDate: string): ProjectTaskRecurrenceWeekday {
  return PROJECT_TASK_RECURRENCE_WEEKDAYS[parseTaskEditorIsoDate(isoDate).getUTCDay()]!;
}

function taskEditorOrdinalForDate(isoDate: string): ProjectTaskRecurrenceOrdinal {
  const dayOfMonth = parseTaskEditorIsoDate(isoDate).getUTCDate();
  if (dayOfMonth >= 29) {
    return "last";
  }
  if (dayOfMonth >= 22) {
    return "fourth";
  }
  if (dayOfMonth >= 15) {
    return "third";
  }
  if (dayOfMonth >= 8) {
    return "second";
  }
  return "first";
}

function taskEditorDayOfMonthForDate(isoDate: string): number {
  return parseTaskEditorIsoDate(isoDate).getUTCDate();
}

function taskEditorMonthForDate(isoDate: string): number {
  return parseTaskEditorIsoDate(isoDate).getUTCMonth() + 1;
}

function createRecurrenceDraft(startDate: string = getLocalIsoDate()): TaskRecurrenceDraft {
  return {
    startDate,
    ruleKind: "daily",
    interval: 1,
    weekdays: [taskEditorWeekdayForDate(startDate)],
    dayOfMonth: taskEditorDayOfMonthForDate(startDate),
    ordinal: taskEditorOrdinalForDate(startDate),
    weekday: taskEditorWeekdayForDate(startDate),
    month: taskEditorMonthForDate(startDate),
  };
}

function syncRecurrenceDraftToStartDate(
  draft: TaskRecurrenceDraft,
  startDate: string,
): TaskRecurrenceDraft {
  const startWeekday = taskEditorWeekdayForDate(startDate);

  switch (draft.ruleKind) {
    case "daily":
      return { ...draft, startDate };
    case "weekly":
      return {
        ...draft,
        startDate,
        weekdays: Array.from(new Set([...draft.weekdays, startWeekday])).toSorted(
          (left, right) =>
            PROJECT_TASK_RECURRENCE_WEEKDAYS.indexOf(left) -
            PROJECT_TASK_RECURRENCE_WEEKDAYS.indexOf(right),
        ),
      };
    case "monthly-day":
      return {
        ...draft,
        startDate,
        dayOfMonth: taskEditorDayOfMonthForDate(startDate),
      };
    case "monthly-ordinal-weekday":
      return {
        ...draft,
        startDate,
        ordinal: taskEditorOrdinalForDate(startDate),
        weekday: startWeekday,
      };
    case "yearly-date":
      return {
        ...draft,
        startDate,
        month: taskEditorMonthForDate(startDate),
        dayOfMonth: taskEditorDayOfMonthForDate(startDate),
      };
    case "yearly-ordinal-weekday":
      return {
        ...draft,
        startDate,
        month: taskEditorMonthForDate(startDate),
        ordinal: taskEditorOrdinalForDate(startDate),
        weekday: startWeekday,
      };
  }
}

function recurrenceDraftFromTask(recurrence: ProjectTaskRecurrence): TaskRecurrenceDraft {
  switch (recurrence.rule.kind) {
    case "daily":
      return {
        ...createRecurrenceDraft(recurrence.startDate),
        startDate: recurrence.startDate,
        ruleKind: recurrence.rule.kind,
        interval: recurrence.rule.interval,
      };
    case "weekly":
      return {
        ...createRecurrenceDraft(recurrence.startDate),
        startDate: recurrence.startDate,
        ruleKind: recurrence.rule.kind,
        interval: recurrence.rule.interval,
        weekdays: recurrence.rule.weekdays,
      };
    case "monthly-day":
      return {
        ...createRecurrenceDraft(recurrence.startDate),
        startDate: recurrence.startDate,
        ruleKind: recurrence.rule.kind,
        interval: recurrence.rule.interval,
        dayOfMonth: recurrence.rule.dayOfMonth,
      };
    case "monthly-ordinal-weekday":
      return {
        ...createRecurrenceDraft(recurrence.startDate),
        startDate: recurrence.startDate,
        ruleKind: recurrence.rule.kind,
        interval: recurrence.rule.interval,
        ordinal: recurrence.rule.ordinal,
        weekday: recurrence.rule.weekday,
      };
    case "yearly-date":
      return {
        ...createRecurrenceDraft(recurrence.startDate),
        startDate: recurrence.startDate,
        ruleKind: recurrence.rule.kind,
        interval: recurrence.rule.interval,
        month: recurrence.rule.month,
        dayOfMonth: recurrence.rule.dayOfMonth,
      };
    case "yearly-ordinal-weekday":
      return {
        ...createRecurrenceDraft(recurrence.startDate),
        startDate: recurrence.startDate,
        ruleKind: recurrence.rule.kind,
        interval: recurrence.rule.interval,
        month: recurrence.rule.month,
        ordinal: recurrence.rule.ordinal,
        weekday: recurrence.rule.weekday,
      };
  }
}

function buildRecurrenceFromDraft(draft: TaskRecurrenceDraft): ProjectTaskRecurrence {
  switch (draft.ruleKind) {
    case "daily":
      return {
        startDate: draft.startDate,
        rule: {
          kind: "daily",
          interval: draft.interval,
        },
        completionDates: [],
      };
    case "weekly":
      return {
        startDate: draft.startDate,
        rule: {
          kind: "weekly",
          interval: draft.interval,
          weekdays: draft.weekdays,
        },
        completionDates: [],
      };
    case "monthly-day":
      return {
        startDate: draft.startDate,
        rule: {
          kind: "monthly-day",
          interval: draft.interval,
          dayOfMonth: draft.dayOfMonth,
        },
        completionDates: [],
      };
    case "monthly-ordinal-weekday":
      return {
        startDate: draft.startDate,
        rule: {
          kind: "monthly-ordinal-weekday",
          interval: draft.interval,
          ordinal: draft.ordinal,
          weekday: draft.weekday,
        },
        completionDates: [],
      };
    case "yearly-date":
      return {
        startDate: draft.startDate,
        rule: {
          kind: "yearly-date",
          interval: draft.interval,
          month: draft.month,
          dayOfMonth: draft.dayOfMonth,
        },
        completionDates: [],
      };
    case "yearly-ordinal-weekday":
      return {
        startDate: draft.startDate,
        rule: {
          kind: "yearly-ordinal-weekday",
          interval: draft.interval,
          month: draft.month,
          ordinal: draft.ordinal,
          weekday: draft.weekday,
        },
        completionDates: [],
      };
  }
}

function recurrenceRuleLabel(ruleKind: TaskRecurrenceRuleKind): string {
  switch (ruleKind) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly-day":
      return "Monthly by date";
    case "monthly-ordinal-weekday":
      return "Monthly by weekday";
    case "yearly-date":
      return "Yearly by date";
    case "yearly-ordinal-weekday":
      return "Yearly by weekday";
  }
}

function standaloneTaskRowKey(taskId: string): string {
  return `standalone:${taskId}`;
}

function goalTaskRowKey(goalId: string, taskId: string): string {
  return `goal:${goalId}:task:${taskId}`;
}

function statusBadgeVariant(status: ProjectGoalStatus) {
  switch (status) {
    case "working":
      return "info";
    case "scheduled":
      return "secondary";
    case "planning":
      return "outline";
    case "done":
      return "success";
    case "archived":
      return "warning";
  }
}

function taskProgressLabel(task: ProjectTask): string {
  const completeCount = task.subtasks.filter((subtask) => subtask.done).length;
  return `${completeCount}/${task.subtasks.length}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

function groupTaskEntries(
  tasks: readonly ProjectTask[],
  options?: {
    includeArchived?: boolean;
  },
) {
  return groupTaskItemsByStatus(tasks, (task) => task.status, options);
}

function StatusBadge({ status }: { status: ProjectGoalStatus }) {
  return <Badge variant={statusBadgeVariant(status)}>{PROJECT_GOAL_STATUS_LABELS[status]}</Badge>;
}

function StatusSelect({
  value,
  onValueChange,
  ariaLabel,
}: {
  value: ProjectGoalStatus;
  onValueChange: (value: ProjectGoalStatus) => void;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as ProjectGoalStatus)}>
      <SelectTrigger aria-label={ariaLabel} className="w-34" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projectTaskBoardStatuses({ includeArchived: true }).map((status) => (
          <SelectItem key={status} value={status}>
            {PROJECT_GOAL_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GoalEditorDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: GoalEditorState | null;
  onClose: () => void;
  onSubmit: (input: { name: string; status: ProjectGoalStatus }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<ProjectGoalStatus>("planning");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setName(state.goal.name);
      setStatus(state.goal.status);
      return;
    }
    setName("");
    setStatus("planning");
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        status,
      });
      onClose();
    } catch {
      // Keep dialog open so the user can correct or retry the save.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? "Edit Goal" : "New Goal"}</DialogTitle>
          <DialogDescription>Track a project goal and group its tasks by status.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogPanel className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-goal-name">Name</Label>
              <Input
                id="project-goal-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Improve onboarding"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <StatusSelect value={status} onValueChange={setStatus} ariaLabel="Goal status" />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button disabled={saving || name.trim().length === 0} type="submit">
              {saving ? "Saving..." : state?.mode === "edit" ? "Save Goal" : "Create Goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function TaskEditorDialog({
  state,
  onClose,
  onSubmit,
}: {
  state: TaskEditorState | null;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    description: string;
    status: ProjectGoalStatus;
    scheduledDate: string | null;
    recurrence: ProjectTaskRecurrence | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<ProjectGoalStatus>("planning");
  const [scheduleMode, setScheduleMode] = React.useState<TaskScheduleMode>("none");
  const [scheduledDate, setScheduledDate] = React.useState("");
  const [recurrenceDraft, setRecurrenceDraft] = React.useState<TaskRecurrenceDraft>(
    createRecurrenceDraft(),
  );
  const [saving, setSaving] = React.useState(false);
  const recurringTaskStatus =
    state?.mode === "edit" && state.task.recurrence !== null && state.task.status === "archived"
      ? "archived"
      : "working";

  React.useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setTitle(state.task.title);
      setDescription(state.task.description);
      setStatus(state.task.status);
      if (state.task.recurrence) {
        setScheduleMode("recurring");
        setScheduledDate("");
        setRecurrenceDraft(recurrenceDraftFromTask(state.task.recurrence));
      } else if (state.task.scheduledDate) {
        setScheduleMode("one-time");
        setScheduledDate(state.task.scheduledDate);
        setRecurrenceDraft(createRecurrenceDraft(state.task.scheduledDate));
      } else {
        setScheduleMode("none");
        setScheduledDate("");
        setRecurrenceDraft(createRecurrenceDraft());
      }
      return;
    }
    setTitle("");
    setDescription("");
    setStatus("planning");
    setScheduleMode("none");
    setScheduledDate("");
    setRecurrenceDraft(createRecurrenceDraft());
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const recurrence =
        scheduleMode === "recurring" ? buildRecurrenceFromDraft(recurrenceDraft) : null;
      await onSubmit({
        title: title.trim(),
        description,
        status: recurrence ? recurringTaskStatus : status,
        scheduledDate:
          scheduleMode === "one-time" && scheduledDate.length > 0 ? scheduledDate : null,
        recurrence,
      });
      onClose();
    } catch {
      // Keep dialog open so the user can retry the save.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            {scheduleMode === "recurring"
              ? "Capture the task and recurrence. Recurring tasks stay active until archived."
              : "Capture the task, notes, and current status."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogPanel className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-task-title">Title</Label>
              <Input
                id="project-task-title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Write release notes"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-task-description">Description</Label>
              <Textarea
                id="project-task-description"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                placeholder="Add context, constraints, or links."
              />
            </div>
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select
                value={scheduleMode}
                onValueChange={(next) => {
                  const nextMode = next as TaskScheduleMode;
                  setScheduleMode(nextMode);
                  if (nextMode === "one-time" && scheduledDate.length === 0) {
                    setScheduledDate(recurrenceDraft.startDate);
                  }
                  if (nextMode === "recurring") {
                    setRecurrenceDraft((current) =>
                      syncRecurrenceDraftToStartDate(
                        current,
                        scheduledDate || current.startDate || getLocalIsoDate(),
                      ),
                    );
                  }
                }}
              >
                <SelectTrigger aria-label="Task schedule mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="one-time">One-time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleMode !== "recurring" ? (
              <div className="space-y-2">
                <Label>Status</Label>
                <StatusSelect value={status} onValueChange={setStatus} ariaLabel="Task status" />
              </div>
            ) : null}
            {scheduleMode === "one-time" ? (
              <div className="space-y-2">
                <Label htmlFor="project-task-scheduled-date">Scheduled Date</Label>
                <Input
                  id="project-task-scheduled-date"
                  nativeInput
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.currentTarget.value)}
                />
              </div>
            ) : null}
            {scheduleMode === "recurring" ? (
              <div className="space-y-4 rounded-xl border border-border/80 bg-background/70 p-4">
                <div className="space-y-2">
                  <Label htmlFor="project-task-recurring-start-date">Start Date</Label>
                  <Input
                    id="project-task-recurring-start-date"
                    nativeInput
                    type="date"
                    value={recurrenceDraft.startDate}
                    onChange={(event) => {
                      const nextStartDate = event.currentTarget.value;
                      setRecurrenceDraft((current) =>
                        syncRecurrenceDraftToStartDate(current, nextStartDate),
                      );
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select
                    value={recurrenceDraft.ruleKind}
                    onValueChange={(next) =>
                      setRecurrenceDraft((current) =>
                        syncRecurrenceDraftToStartDate(
                          { ...current, ruleKind: next as TaskRecurrenceRuleKind },
                          current.startDate,
                        ),
                      )
                    }
                  >
                    <SelectTrigger aria-label="Recurring task frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        [
                          "daily",
                          "weekly",
                          "monthly-day",
                          "monthly-ordinal-weekday",
                          "yearly-date",
                          "yearly-ordinal-weekday",
                        ] as const
                      ).map((ruleKind) => (
                        <SelectItem key={ruleKind} value={ruleKind}>
                          {recurrenceRuleLabel(ruleKind)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-task-recurring-interval">Interval</Label>
                  <Input
                    id="project-task-recurring-interval"
                    nativeInput
                    min={1}
                    type="number"
                    value={recurrenceDraft.interval}
                    onChange={(event) => {
                      const nextInterval = Math.max(1, Number(event.currentTarget.value) || 1);
                      setRecurrenceDraft((current) => ({
                        ...current,
                        interval: nextInterval,
                      }));
                    }}
                  />
                </div>
                {recurrenceDraft.ruleKind === "weekly" ? (
                  <div className="space-y-2">
                    <Label>Weekdays</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {PROJECT_TASK_RECURRENCE_WEEKDAYS.map((weekday) => (
                        <label
                          key={weekday}
                          className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={recurrenceDraft.weekdays.includes(weekday)}
                            onCheckedChange={(checked) =>
                              setRecurrenceDraft((current) => ({
                                ...current,
                                weekdays: checked
                                  ? Array.from(new Set([...current.weekdays, weekday])).toSorted(
                                      (left, right) =>
                                        PROJECT_TASK_RECURRENCE_WEEKDAYS.indexOf(left) -
                                        PROJECT_TASK_RECURRENCE_WEEKDAYS.indexOf(right),
                                    )
                                  : current.weekdays.filter((entry) => entry !== weekday),
                              }))
                            }
                          />
                          <span className="capitalize">{weekday.slice(0, 3)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                {recurrenceDraft.ruleKind === "monthly-day" ||
                recurrenceDraft.ruleKind === "yearly-date" ? (
                  <>
                    {recurrenceDraft.ruleKind === "yearly-date" ? (
                      <div className="space-y-2">
                        <Label>Month</Label>
                        <Select
                          value={String(recurrenceDraft.month)}
                          onValueChange={(next) =>
                            setRecurrenceDraft((current) => ({
                              ...current,
                              month: Number(next),
                            }))
                          }
                        >
                          <SelectTrigger aria-label="Recurring task month">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTH_OPTIONS.map((month) => (
                              <SelectItem key={month.value} value={String(month.value)}>
                                {month.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="project-task-recurring-day-of-month">Day of Month</Label>
                      <Input
                        id="project-task-recurring-day-of-month"
                        nativeInput
                        min={1}
                        max={31}
                        type="number"
                        value={recurrenceDraft.dayOfMonth}
                        onChange={(event) => {
                          const nextDayOfMonth = Math.min(
                            31,
                            Math.max(1, Number(event.currentTarget.value) || 1),
                          );
                          setRecurrenceDraft((current) => ({
                            ...current,
                            dayOfMonth: nextDayOfMonth,
                          }));
                        }}
                      />
                    </div>
                  </>
                ) : null}
                {recurrenceDraft.ruleKind === "monthly-ordinal-weekday" ||
                recurrenceDraft.ruleKind === "yearly-ordinal-weekday" ? (
                  <>
                    {recurrenceDraft.ruleKind === "yearly-ordinal-weekday" ? (
                      <div className="space-y-2">
                        <Label>Month</Label>
                        <Select
                          value={String(recurrenceDraft.month)}
                          onValueChange={(next) =>
                            setRecurrenceDraft((current) => ({
                              ...current,
                              month: Number(next),
                            }))
                          }
                        >
                          <SelectTrigger aria-label="Recurring ordinal task month">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTH_OPTIONS.map((month) => (
                              <SelectItem key={month.value} value={String(month.value)}>
                                {month.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Ordinal</Label>
                        <Select
                          value={recurrenceDraft.ordinal}
                          onValueChange={(next) =>
                            setRecurrenceDraft((current) => ({
                              ...current,
                              ordinal: next as ProjectTaskRecurrenceOrdinal,
                            }))
                          }
                        >
                          <SelectTrigger aria-label="Recurring task ordinal">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_TASK_RECURRENCE_ORDINALS.map((ordinal) => (
                              <SelectItem key={ordinal} value={ordinal}>
                                {ordinal}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Weekday</Label>
                        <Select
                          value={recurrenceDraft.weekday}
                          onValueChange={(next) =>
                            setRecurrenceDraft((current) => ({
                              ...current,
                              weekday: next as ProjectTaskRecurrenceWeekday,
                            }))
                          }
                        >
                          <SelectTrigger aria-label="Recurring task weekday">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_TASK_RECURRENCE_WEEKDAYS.map((weekday) => (
                              <SelectItem key={weekday} value={weekday}>
                                {weekday}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button disabled={saving || title.trim().length === 0} type="submit">
              {saving ? "Saving..." : state?.mode === "edit" ? "Save Task" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function AttachThreadDialog({
  candidates,
  open,
  onAttach,
  onClose,
  taskTitle,
}: {
  candidates: TaskThreadCandidate[];
  open: boolean;
  onAttach: (threadId: string) => Promise<void>;
  onClose: () => void;
  taskTitle: string;
}) {
  const [query, setQuery] = React.useState("");
  const [pendingThreadId, setPendingThreadId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setPendingThreadId(null);
    }
  }, [open]);

  const filteredCandidates = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return candidates;
    }
    return candidates.filter((candidate) =>
      `${candidate.title} ${candidate.threadId}`.toLowerCase().includes(normalizedQuery),
    );
  }, [candidates, query]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Attach Existing Thread</DialogTitle>
          <DialogDescription>
            Link an existing thread to {taskTitle || "this task"}.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="attach-thread-search">Search</Label>
            <Input
              id="attach-thread-search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filter threads"
              autoFocus
            />
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {filteredCandidates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                No available threads to attach.
              </div>
            ) : (
              filteredCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 text-left hover:bg-accent"
                  onClick={async () => {
                    setPendingThreadId(candidate.threadId);
                    try {
                      await onAttach(candidate.threadId);
                      onClose();
                    } finally {
                      setPendingThreadId(null);
                    }
                  }}
                  disabled={pendingThreadId !== null}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{candidate.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.statusLabel} • {candidate.threadId}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {pendingThreadId === candidate.threadId ? "Linking..." : candidate.kind}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function TaskCard({
  task,
  linkedThreads,
  open,
  onOpenChange,
  onAttachExistingThread,
  onEdit,
  onDelete,
  onOpenLinkedThread,
  onStatusChange,
  onStartNewThread,
  onCompleteOccurrence,
  onUncompleteOccurrence,
  onCreateSubtask,
  onUnlinkThread,
  onUpdateSubtask,
  onDeleteSubtask,
  addSubtaskLabel = "Add Subtask",
}: {
  task: ProjectTask;
  linkedThreads: LinkedThreadPresentation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttachExistingThread: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLinkedThread: (threadId: string) => void;
  onStatusChange: (status: ProjectGoalStatus) => Promise<void>;
  onStartNewThread: () => Promise<void>;
  onCompleteOccurrence: (occurrenceDate: string) => Promise<void>;
  onUncompleteOccurrence: (occurrenceDate: string) => Promise<void>;
  onCreateSubtask: (task: string) => Promise<void>;
  onUnlinkThread: (threadId: string) => Promise<void>;
  onUpdateSubtask: (
    subtaskId: string,
    patch: { task?: string; done?: boolean },
  ) => Promise<void>;
  onDeleteSubtask: (subtaskId: string) => Promise<void>;
  addSubtaskLabel?: string;
}) {
  const [newSubtask, setNewSubtask] = React.useState("");
  const [editingSubtaskIndex, setEditingSubtaskIndex] = React.useState<number | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = React.useState("");
  const [pendingStatus, setPendingStatus] = React.useState<ProjectGoalStatus>(task.status);
  const scheduleLabel = getTaskScheduleLabel({ task });
  const scheduleVariant = isTaskOverdue({ task }) ? "warning" : "secondary";
  const recurrenceSummary = getTaskRecurrenceSummary(task);
  const nextOpenOccurrence = getTaskNextOpenOccurrence({ task });
  const recentCompletionDates =
    task.recurrence === null
      ? []
      : task.recurrence.completionDates.toReversed().slice(0, 5);
  const showsRecurringStatus = task.recurrence === null || task.status === "archived";

  React.useEffect(() => {
    setPendingStatus(task.status);
  }, [task.status]);

  const submitNewSubtask = async () => {
    const trimmed = newSubtask.trim();
    if (trimmed.length === 0) return;
    await onCreateSubtask(trimmed);
    setNewSubtask("");
  };

  const saveEditedSubtask = async () => {
    if (editingSubtaskIndex === null) return;
    const trimmed = editingSubtaskText.trim();
    if (trimmed.length === 0) return;
    const subtask = task.subtasks[editingSubtaskIndex];
    if (!subtask) return;
    await onUpdateSubtask(subtask.id, { task: trimmed });
    setEditingSubtaskIndex(null);
    setEditingSubtaskText("");
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="rounded-xl border border-border bg-background/85">
        <div className="flex flex-col gap-3 px-4 py-3">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-3 text-left">
            {open ? (
              <ChevronDownIcon className="mt-0.5 size-4 shrink-0" />
            ) : (
              <ChevronRightIcon className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">{task.title || "Untitled task"}</p>
                {showsRecurringStatus ? <StatusBadge status={task.status} /> : null}
                {scheduleLabel ? <Badge variant={scheduleVariant}>{scheduleLabel}</Badge> : null}
                {recurrenceSummary ? <Badge variant="outline">{recurrenceSummary}</Badge> : null}
                <Badge variant="outline">{linkedThreads.length} linked</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Subtasks {taskProgressLabel(task)}</p>
            </div>
          </CollapsibleTrigger>
          <div className="flex flex-wrap items-center gap-2">
            {task.recurrence === null ? (
              <StatusSelect
                value={pendingStatus}
                ariaLabel={`Status for ${task.title || "task"}`}
                onValueChange={async (status) => {
                  setPendingStatus(status);
                  await onStatusChange(status);
                }}
              />
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  void onStatusChange(task.status === "archived" ? "working" : "archived")
                }
              >
                {task.status === "archived" ? "Unarchive" : "Archive"}
              </Button>
            )}
            <Button size="xs" variant="outline" onClick={() => onOpenChange(true)}>
              {addSubtaskLabel}
            </Button>
            <Button size="xs" variant="outline" onClick={onAttachExistingThread}>
              Link Thread
            </Button>
            <Button size="xs" variant="outline" onClick={() => void onStartNewThread()}>
              Start Thread
            </Button>
            {task.recurrence !== null && nextOpenOccurrence ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() => void onCompleteOccurrence(nextOpenOccurrence)}
              >
                Mark {formatScheduledDate(nextOpenOccurrence)} Complete
              </Button>
            ) : null}
            <Button size="xs" variant="outline" onClick={onEdit}>
              <PencilIcon />
              Edit
            </Button>
            <Button size="xs" variant="destructive-outline" onClick={onDelete}>
              <Trash2Icon />
              Delete
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border/80 px-4 py-4">
            <div className="space-y-4">
              <div>
                {scheduleLabel || recurrenceSummary ? (
                  <div className="mb-4 space-y-2">
                    <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      {task.recurrence ? "Recurring" : "Scheduled"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {scheduleLabel ? <Badge variant={scheduleVariant}>{scheduleLabel}</Badge> : null}
                      {recurrenceSummary ? <Badge variant="outline">{recurrenceSummary}</Badge> : null}
                      {task.recurrence ? (
                        <Badge variant="outline">
                          Starts {formatScheduledDate(task.recurrence.startDate)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {task.recurrence ? (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                        Completions
                      </p>
                      <Badge variant="outline">{task.recurrence.completionDates.length}</Badge>
                    </div>
                    {recentCompletionDates.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                        No completed occurrences yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentCompletionDates.map((completionDate) => (
                          <div
                            key={completionDate}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/80 px-3 py-2"
                          >
                            <p className="text-sm text-foreground">
                              {formatScheduledDate(completionDate)}
                            </p>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => void onUncompleteOccurrence(completionDate)}
                            >
                              Undo
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      Linked Threads
                    </p>
                    <Badge variant="outline">{linkedThreads.length}</Badge>
                  </div>
                  {linkedThreads.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                      No linked threads yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {linkedThreads.map((thread) => (
                        <div
                          key={thread.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/80 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">{thread.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {thread.statusLabel}
                              {thread.kind === "missing" ? ` • ${thread.threadId}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {thread.kind !== "missing" ? (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => onOpenLinkedThread(thread.threadId)}
                              >
                                Open
                              </Button>
                            ) : null}
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => void onUnlinkThread(thread.threadId)}
                            >
                              Unlink
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Description
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {task.description.trim().length > 0 ? task.description : "No description yet."}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    Subtasks
                  </p>
                  <Badge variant="outline">{taskProgressLabel(task)}</Badge>
                </div>

                {task.subtasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                    No subtasks yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {task.subtasks.map((subtask, subtaskIndex) => {
                      const isEditing = editingSubtaskIndex === subtaskIndex;
                      return (
                        <div
                          key={subtask.id}
                          className="flex items-center gap-3 rounded-lg border border-border/80 px-3 py-2"
                        >
                          <Checkbox
                            checked={subtask.done}
                            aria-label={`Mark ${subtask.task} complete`}
                            onCheckedChange={async (checked) => {
                              await onUpdateSubtask(subtask.id, {
                                done: Boolean(checked),
                              });
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <Input
                                value={editingSubtaskText}
                                onChange={(event) => setEditingSubtaskText(event.currentTarget.value)}
                                onKeyDown={async (event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    await saveEditedSubtask();
                                  }
                                }}
                                aria-label="Subtask text"
                                size="sm"
                              />
                            ) : (
                              <p
                                className={`text-sm ${subtask.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                              >
                                {subtask.task}
                              </p>
                            )}
                          </div>
                          {isEditing ? (
                            <>
                              <Button size="xs" variant="outline" onClick={() => void saveEditedSubtask()}>
                                Save
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                  setEditingSubtaskIndex(null);
                                  setEditingSubtaskText("");
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  setEditingSubtaskIndex(subtaskIndex);
                                  setEditingSubtaskText(subtask.task);
                                }}
                              >
                                <PencilIcon />
                                Edit
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => void onDeleteSubtask(subtask.id)}
                              >
                                <Trash2Icon />
                                Remove
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-3 py-3 sm:flex-row">
                  <Input
                    value={newSubtask}
                    onChange={(event) => setNewSubtask(event.currentTarget.value)}
                    placeholder="Add a subtask"
                    size="sm"
                    onKeyDown={async (event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        await submitNewSubtask();
                      }
                    }}
                  />
                  <Button size="sm" onClick={() => void submitNewSubtask()}>
                    <PlusIcon />
                    Add Subtask
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function ProjectOverviewContent({
  activeSection,
  goalEditorOpen,
  highlightedTaskId,
  loadingLabel,
  onGoalEditorOpenChange,
  onOpenCalendarTask,
  onTaskEditorOpenChange,
  projectId,
  taskEditorOpen,
  threadProjectId,
  workspaceRoot,
}: {
  activeSection: ProjectOverviewSection;
  goalEditorOpen: boolean;
  highlightedTaskId?: string;
  loadingLabel?: string;
  onGoalEditorOpenChange: (open: boolean) => void;
  onOpenCalendarTask: (task: ProjectCalendarTaskItem) => void;
  onTaskEditorOpenChange: (open: boolean) => void;
  projectId: ProjectId | null;
  taskEditorOpen: boolean;
  threadProjectId: ProjectId;
  workspaceRoot: string;
}) {
  const threadProject = useStore(
    (store) => store.projects.find((entry) => entry.id === threadProjectId) ?? null,
  );
  const threads = useStore((store) => store.threads);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const api = ensureNativeApi();
  const getDraftThreadByProjectId = useComposerDraftStore((store) => store.getDraftThreadByProjectId);
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const setPrompt = useComposerDraftStore((store) => store.setPrompt);

  const [openTaskRows, setOpenTaskRows] = React.useState<Record<string, boolean>>({});
  const [goalEditorState, setGoalEditorState] = React.useState<GoalEditorState | null>(null);
  const [taskEditorState, setTaskEditorState] = React.useState<TaskEditorState | null>(null);
  const [attachThreadDialogTask, setAttachThreadDialogTask] = React.useState<TaskThreadDialogTask | null>(null);
  const [showArchivedStandaloneTasks, setShowArchivedStandaloneTasks] = React.useState(false);
  const [showArchivedGoalTasks, setShowArchivedGoalTasks] = React.useState(false);
  const [pendingScrollTaskRowKey, setPendingScrollTaskRowKey] = React.useState<string | null>(null);
  const previousSectionKindRef = React.useRef(activeSection.kind);
  const taskRowElementsRef = React.useRef<Record<string, HTMLDivElement | null>>({});

  const projectGoalsQuery = useQuery(
    projectPlanningSnapshotQueryOptions({
      projectId,
      cwd: workspaceRoot,
    }),
  );
  const snapshotQueryKey = projectPlanningQueryKeys.snapshot(projectId, workspaceRoot);

  const runPlanningMutation = React.useCallback(
    async (
      run: () => Promise<import("@t3tools/contracts").ProjectPlanningMutationResult>,
    ) => {
      try {
        const result = unwrapMutationResult(await run());
        queryClient.setQueryData(snapshotQueryKey, result.snapshot);
        return result;
      } catch (error) {
        if (error instanceof ProjectPlanningRpcError && error.code === "conflict") {
          await queryClient.invalidateQueries({ queryKey: snapshotQueryKey });
        }
        toastManager.add({
          type: "error",
          title: "Failed to save project goals",
          description: errorMessage(error),
        });
        throw error;
      }
    },
    [queryClient, snapshotQueryKey],
  );

  const planningTarget = React.useMemo(
    () => ({
      ...(projectId ? { projectId } : {}),
      workspaceRoot,
      ...(projectGoalsQuery.data?.revision
        ? { expectedRevision: projectGoalsQuery.data.revision }
        : {}),
    }),
    [projectGoalsQuery.data?.revision, projectId, workspaceRoot],
  );

  React.useEffect(() => {
    if (goalEditorOpen) {
      setGoalEditorState((current) => current ?? { mode: "create" });
    }
  }, [goalEditorOpen]);

  React.useEffect(() => {
    if (taskEditorOpen) {
      setTaskEditorState((current) => current ?? { mode: "create", scope: "standalone" });
    }
  }, [taskEditorOpen]);

  const closeGoalEditor = React.useCallback(() => {
    setGoalEditorState(null);
    onGoalEditorOpenChange(false);
  }, [onGoalEditorOpenChange]);

  const closeTaskEditor = React.useCallback(() => {
    setTaskEditorState(null);
    onTaskEditorOpenChange(false);
  }, [onTaskEditorOpenChange]);

  const document = projectGoalsQuery.data?.document;
  const standaloneHasArchivedTasks = document?.tasks.some((task) => task.status === "archived") ?? false;
  const hasAnyStandaloneTasks = (document?.tasks.length ?? 0) > 0;
  const selectedGoalId = activeSection.kind === "goal" ? activeSection.goalId : null;
  const selectedGoal =
    selectedGoalId === null ? null : document?.goals.find((goal) => goal.id === selectedGoalId) ?? null;
  const selectedGoalHasArchivedTasks =
    selectedGoal?.tasks.some((task) => task.status === "archived") ?? false;
  const projectDraftThread = getDraftThreadByProjectId(threadProjectId);

  const openTaskRow = React.useCallback((rowKey: string) => {
    setOpenTaskRows((current) => ({ ...current, [rowKey]: true }));
  }, []);

  const setTaskRowOpen = React.useCallback((rowKey: string, open: boolean, accordion: boolean) => {
    setOpenTaskRows((current) => {
      if (accordion) {
        return open ? { [rowKey]: true } : {};
      }
      return { ...current, [rowKey]: open };
    });
  }, []);

  React.useEffect(() => {
    if (!highlightedTaskId) {
      return;
    }
    if (activeSection.kind === "standalone-tasks") {
      openTaskRow(standaloneTaskRowKey(highlightedTaskId));
      return;
    }
    if (activeSection.kind === "goal") {
      openTaskRow(goalTaskRowKey(activeSection.goalId, highlightedTaskId));
    }
  }, [activeSection, highlightedTaskId, openTaskRow]);

  React.useEffect(() => {
    if (!standaloneHasArchivedTasks) {
      setShowArchivedStandaloneTasks(false);
    }
  }, [standaloneHasArchivedTasks]);

  React.useEffect(() => {
    if (!selectedGoalHasArchivedTasks) {
      setShowArchivedGoalTasks(false);
    }
  }, [selectedGoalHasArchivedTasks]);

  React.useEffect(() => {
    const previousKind = previousSectionKindRef.current;
    if (previousKind === "calendar" && activeSection.kind !== "calendar" && !highlightedTaskId) {
      setOpenTaskRows({});
    }
    previousSectionKindRef.current = activeSection.kind;
  }, [activeSection.kind, highlightedTaskId]);

  React.useEffect(() => {
    if (!pendingScrollTaskRowKey) {
      return;
    }

    const element = taskRowElementsRef.current[pendingScrollTaskRowKey];
    if (!element) {
      return;
    }

    element.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    setPendingScrollTaskRowKey(null);
  }, [activeSection, pendingScrollTaskRowKey, document]);

  const saveGoalEditor = async (input: { name: string; status: ProjectGoalStatus }) => {
    if (!goalEditorState) return;
    if (goalEditorState.mode === "create") {
      await runPlanningMutation(() =>
        api.projectPlanning.createGoal({
          ...planningTarget,
          name: input.name,
          status: input.status,
        }),
      );
      return;
    }

    await runPlanningMutation(() =>
      api.projectPlanning.updateGoal({
        ...planningTarget,
        goalId: goalEditorState.goalId,
        name: input.name,
        status: input.status,
      }),
    );
  };

  const saveTaskEditor = async (input: {
    title: string;
    description: string;
    status: ProjectGoalStatus;
    scheduledDate: string | null;
    recurrence: ProjectTaskRecurrence | null;
  }) => {
    if (!taskEditorState) return;

    if (taskEditorState.mode === "create" && taskEditorState.scope === "standalone") {
      const result = await runPlanningMutation(() =>
        api.projectPlanning.createTask({
          ...planningTarget,
          title: input.title,
          description: input.description,
          status: input.status,
          ...(input.scheduledDate !== null ? { scheduledDate: input.scheduledDate } : {}),
          ...(input.recurrence !== null ? { recurrence: input.recurrence } : {}),
        }),
      );
      openTaskRow(standaloneTaskRowKey(result.changedId));
      return;
    }

    if (taskEditorState.mode === "create" && taskEditorState.scope === "goal") {
      const result = await runPlanningMutation(() =>
        api.projectPlanning.createTask({
          ...planningTarget,
          goalId: taskEditorState.goalId,
          title: input.title,
          description: input.description,
          status: input.status,
          ...(input.scheduledDate !== null ? { scheduledDate: input.scheduledDate } : {}),
          ...(input.recurrence !== null ? { recurrence: input.recurrence } : {}),
        }),
      );
      openTaskRow(goalTaskRowKey(taskEditorState.goalId, result.changedId));
      return;
    }

    if (taskEditorState.mode === "edit" && taskEditorState.scope === "standalone") {
      await runPlanningMutation(() =>
        api.projectPlanning.updateTask({
          ...planningTarget,
          taskId: taskEditorState.taskId,
          title: input.title,
          description: input.description,
          status: input.status,
          scheduledDate: input.scheduledDate,
          recurrence: input.recurrence,
        }),
      );
      return;
    }

    if (taskEditorState.mode === "edit" && taskEditorState.scope === "goal") {
      await runPlanningMutation(() =>
        api.projectPlanning.updateTask({
          ...planningTarget,
          taskId: taskEditorState.taskId,
          title: input.title,
          description: input.description,
          status: input.status,
          scheduledDate: input.scheduledDate,
          recurrence: input.recurrence,
        }),
      );
    }
  };

  const completeTaskOccurrence = React.useCallback(
    async (taskId: string, occurrenceDate: string) => {
      await runPlanningMutation(() =>
        api.projectPlanning.completeTaskOccurrence({
          ...planningTarget,
          taskId,
          occurrenceDate,
        }),
      );
    },
    [api.projectPlanning, planningTarget, runPlanningMutation],
  );

  const uncompleteTaskOccurrence = React.useCallback(
    async (taskId: string, occurrenceDate: string) => {
      await runPlanningMutation(() =>
        api.projectPlanning.uncompleteTaskOccurrence({
          ...planningTarget,
          taskId,
          occurrenceDate,
        }),
      );
    },
    [api.projectPlanning, planningTarget, runPlanningMutation],
  );

  const attachThreadToTask = React.useCallback(
    async (taskId: string, threadId: string) => {
      await runPlanningMutation(() =>
        api.projectPlanning.attachThreadToTask({
          ...planningTarget,
          taskId,
          threadId,
        }),
      );
    },
    [api.projectPlanning, planningTarget, runPlanningMutation],
  );

  const detachThreadFromTask = React.useCallback(
    async (taskId: string, threadId: string) => {
      await runPlanningMutation(() =>
        api.projectPlanning.detachThreadFromTask({
          ...planningTarget,
          taskId,
          threadId,
        }),
      );
    },
    [api.projectPlanning, planningTarget, runPlanningMutation],
  );

  const openLinkedThread = React.useCallback(
    async (threadId: string) => {
      await navigate({
        to: "/$threadId",
        params: { threadId: threadId as never },
      });
    },
    [navigate],
  );

  const startTaskThread = React.useCallback(
    async (taskInfo: TaskThreadDialogTask) => {
      const nextThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      await attachThreadToTask(taskInfo.taskId, nextThreadId);
      setProjectDraftThreadId(threadProjectId, nextThreadId, {
        createdAt,
        title: buildTaskThreadTitle(taskInfo.task),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_INTERACTION_MODE,
        envMode: "local",
        branch: null,
        worktreePath: null,
      });
      setPrompt(
        nextThreadId,
        buildTaskKickoffPrompt({
          task: taskInfo.task,
          ...(taskInfo.goalName ? { goalName: taskInfo.goalName } : {}),
        }),
      );
      await navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
      });
    },
    [attachThreadToTask, navigate, setProjectDraftThreadId, setPrompt, threadProjectId],
  );

  const attachThreadCandidates = React.useMemo(
    () =>
      attachThreadDialogTask
        ? getTaskThreadCandidates({
            projectId: threadProjectId,
            linkedThreadIds: attachThreadDialogTask.task.linkedThreadIds,
            threads,
            draftThread: projectDraftThread,
          })
        : [],
    [attachThreadDialogTask, projectDraftThread, threadProjectId, threads],
  );

  if (!threadProject) {
    return null;
  }

  if (projectGoalsQuery.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl rounded-2xl border border-border bg-card/80 p-6 text-sm text-muted-foreground shadow-sm">
          {loadingLabel ?? "Loading project goals..."}
        </div>
      </div>
    );
  }

  if (projectGoalsQuery.isError) {
    const invalidDocument = projectGoalsQuery.error instanceof ProjectGoalsDocumentParseError;
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <Alert variant="error">
            <TargetIcon className="mt-0.5" />
            <AlertTitle>
              {invalidDocument ? "Project goals file is invalid" : "Project goals could not be loaded"}
            </AlertTitle>
            <AlertDescription>
              <p>
                {invalidDocument
                  ? "The file exists, but its contents do not match the expected project planning schema."
                  : errorMessage(projectGoalsQuery.error)}
              </p>
              <p className="text-xs">
                File path: <span className="font-mono">{workspaceRoot}/.t3code/project-goals.json</span>
              </p>
            </AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline" onClick={() => void projectGoalsQuery.refetch()}>
                Retry
              </Button>
              {invalidDocument ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    const confirmed = await api.dialogs.confirm(
                      "Initialize a new .t3code/project-goals.json file and overwrite the invalid contents?",
                    );
                    if (!confirmed) return;
                    await api.projects.writeFile({
                      cwd: workspaceRoot,
                      relativePath: ".t3code/project-goals.json",
                      contents: JSON.stringify(createEmptyProjectGoalsDocument(), null, 2).concat("\n"),
                    });
                    await projectGoalsQuery.refetch();
                  }}
                >
                  Initialize new file
                </Button>
              ) : null}
            </AlertAction>
          </Alert>
        </div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  const standaloneGroups = groupTaskEntries(document.tasks, {
    includeArchived: showArchivedStandaloneTasks,
  });
  const visibleStandaloneTaskCount = standaloneGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const selectedGoalTaskGroups = selectedGoal
    ? groupTaskEntries(selectedGoal.tasks, {
        includeArchived: showArchivedGoalTasks,
      })
    : [];

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-6xl">
          {activeSection.kind === "calendar" ? (
            <ProjectOverviewCalendarView
              document={document}
              onCompleteOccurrence={(taskId, occurrenceDate) =>
                completeTaskOccurrence(taskId, occurrenceDate)
              }
              onOpenTask={(task) => {
                setPendingScrollTaskRowKey(
                  task.goalId
                    ? goalTaskRowKey(task.goalId, task.taskId)
                    : standaloneTaskRowKey(task.taskId),
                );
                onOpenCalendarTask(task);
              }}
              onUncompleteOccurrence={(taskId, occurrenceDate) =>
                uncompleteTaskOccurrence(taskId, occurrenceDate)
              }
            />
          ) : activeSection.kind === "standalone-tasks" ? (
            <TaskKanbanBoard
              title="Tasks"
              description="Tasks that are not attached to a goal."
              count={visibleStandaloneTaskCount}
              groups={standaloneGroups}
              hasAnyTasks={hasAnyStandaloneTasks}
              hasArchivedTasks={standaloneHasArchivedTasks}
              showArchived={showArchivedStandaloneTasks}
              onShowArchivedChange={setShowArchivedStandaloneTasks}
              alwaysShowBoard
              showSummary={false}
              emptyState={{
                title: "No tasks yet",
                description: "Use tasks for work that does not belong under a larger goal.",
                actionLabel: "New Task",
                onAction: () => setTaskEditorState({ mode: "create", scope: "standalone" }),
              }}
              filteredEmptyState={{
                title: "No visible tasks",
                description: "Archived tasks are hidden. Turn on Show archived to view them.",
              }}
              renderTask={(task, _status, layoutMode) => (
                <div
                  key={task.id}
                  ref={(element) => {
                    taskRowElementsRef.current[standaloneTaskRowKey(task.id)] = element;
                  }}
                >
                  <TaskCard
                    linkedThreads={presentLinkedThreads({
                      linkedThreadIds: task.linkedThreadIds,
                      threads,
                      draftThread: projectDraftThread,
                    })}
                    task={task}
                    open={openTaskRows[standaloneTaskRowKey(task.id)] ?? false}
                    onOpenChange={(open) =>
                      setTaskRowOpen(
                        standaloneTaskRowKey(task.id),
                        open,
                        layoutMode === "stacked",
                      )
                    }
                    onAttachExistingThread={() =>
                      setAttachThreadDialogTask({
                        taskId: task.id,
                        task,
                      })
                    }
                    onEdit={() =>
                      setTaskEditorState({
                        mode: "edit",
                        scope: "standalone",
                        taskId: task.id,
                        task,
                      })
                    }
                    onOpenLinkedThread={(threadId) => void openLinkedThread(threadId)}
                    onDelete={async () => {
                      const confirmed = await api.dialogs.confirm(
                        `Delete the task "${task.title || "Untitled task"}"?`,
                      );
                      if (!confirmed) return;
                      await runPlanningMutation(() =>
                        api.projectPlanning.deleteTask({
                          ...planningTarget,
                          taskId: task.id,
                        }),
                      );
                    }}
                    onStatusChange={async (status) => {
                      await runPlanningMutation(() =>
                        api.projectPlanning.updateTask({
                          ...planningTarget,
                          taskId: task.id,
                          status,
                        }),
                      );
                    }}
                    onStartNewThread={() =>
                      startTaskThread({
                        taskId: task.id,
                        task,
                      })
                    }
                    onCompleteOccurrence={(occurrenceDate) =>
                      completeTaskOccurrence(task.id, occurrenceDate)
                    }
                    onUncompleteOccurrence={(occurrenceDate) =>
                      uncompleteTaskOccurrence(task.id, occurrenceDate)
                    }
                    onCreateSubtask={(subtaskTask) =>
                      runPlanningMutation(() =>
                        api.projectPlanning.createSubtask({
                          ...planningTarget,
                          taskId: task.id,
                          task: subtaskTask,
                        }),
                      ).then(() => undefined)
                    }
                    onUnlinkThread={(threadId) => detachThreadFromTask(task.id, threadId)}
                    onUpdateSubtask={(subtaskId, patch) =>
                      runPlanningMutation(() =>
                        api.projectPlanning.updateSubtask({
                          ...planningTarget,
                          subtaskId,
                          ...(patch.task !== undefined ? { task: patch.task } : {}),
                          ...(patch.done !== undefined ? { done: patch.done } : {}),
                        }),
                      ).then(() => undefined)
                    }
                    onDeleteSubtask={(subtaskId) =>
                      runPlanningMutation(() =>
                        api.projectPlanning.deleteSubtask({
                          ...planningTarget,
                          subtaskId,
                        }),
                      ).then(() => undefined)
                    }
                  />
                </div>
              )}
            />
          ) : selectedGoal ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-medium text-foreground">
                      {selectedGoal.name || "Untitled goal"}
                    </h2>
                    <StatusBadge status={selectedGoal.status} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setGoalEditorState({
                        mode: "edit",
                        goalId: selectedGoal.id,
                        goal: selectedGoal,
                      })
                    }
                  >
                    <PencilIcon />
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setTaskEditorState({
                        mode: "create",
                        scope: "goal",
                        goalId: selectedGoal.id,
                      })
                    }
                  >
                    <PlusIcon />
                    Add Task
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      void runPlanningMutation(() =>
                        api.projectPlanning.updateGoal({
                          ...planningTarget,
                          goalId: selectedGoal.id,
                          status: selectedGoal.status === "archived" ? "planning" : "archived",
                        }),
                      )
                    }
                  >
                    {selectedGoal.status === "archived" ? (
                      <>
                        <ArchiveRestoreIcon />
                        Unarchive
                      </>
                    ) : (
                      <>
                        <ArchiveIcon />
                        Archive
                      </>
                    )}
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive-outline"
                    onClick={async () => {
                      const confirmed = await api.dialogs.confirm(
                        `Delete the goal "${selectedGoal.name || "Untitled goal"}" and all nested tasks?`,
                      );
                      if (!confirmed) return;
                      await runPlanningMutation(() =>
                        api.projectPlanning.deleteGoal({
                          ...planningTarget,
                          goalId: selectedGoal.id,
                        }),
                      );
                    }}
                  >
                    <Trash2Icon />
                    Delete
                  </Button>
                </div>
              </div>

              <TaskKanbanBoard
                title="Goal Tasks"
                description="Tasks remain independent from the goal status."
                count={selectedGoalTaskGroups.reduce((total, group) => total + group.items.length, 0)}
                groups={selectedGoalTaskGroups}
                hasAnyTasks={selectedGoal.tasks.length > 0}
                hasArchivedTasks={selectedGoalHasArchivedTasks}
                showArchived={showArchivedGoalTasks}
                onShowArchivedChange={setShowArchivedGoalTasks}
                alwaysShowBoard
                showSummary={false}
                emptyState={{
                  title: "No tasks for this goal",
                  description: "Add a task to break the goal into concrete work.",
                  actionLabel: "New Task",
                  onAction: () =>
                    setTaskEditorState({
                      mode: "create",
                      scope: "goal",
                      goalId: selectedGoal.id,
                    }),
                }}
                filteredEmptyState={{
                  title: "No visible tasks for this goal",
                  description: "Archived tasks are hidden. Turn on Show archived to view them.",
                }}
                renderTask={(task, _status, layoutMode) => (
                  <div
                    key={task.id}
                    ref={(element) => {
                      taskRowElementsRef.current[goalTaskRowKey(selectedGoal.id, task.id)] = element;
                    }}
                  >
                    <TaskCard
                      linkedThreads={presentLinkedThreads({
                        linkedThreadIds: task.linkedThreadIds,
                        threads,
                        draftThread: projectDraftThread,
                      })}
                      task={task}
                      open={openTaskRows[goalTaskRowKey(selectedGoal.id, task.id)] ?? false}
                      onOpenChange={(open) =>
                        setTaskRowOpen(
                          goalTaskRowKey(selectedGoal.id, task.id),
                          open,
                          layoutMode === "stacked",
                        )
                      }
                      onAttachExistingThread={() =>
                        setAttachThreadDialogTask({
                          taskId: task.id,
                          task,
                          goalId: selectedGoal.id,
                          goalName: selectedGoal.name,
                        })
                      }
                      onEdit={() =>
                        setTaskEditorState({
                          mode: "edit",
                          scope: "goal",
                          goalId: selectedGoal.id,
                          taskId: task.id,
                          task,
                        })
                      }
                      onOpenLinkedThread={(threadId) => void openLinkedThread(threadId)}
                      onDelete={async () => {
                        const confirmed = await api.dialogs.confirm(
                          `Delete the task "${task.title || "Untitled task"}"?`,
                        );
                        if (!confirmed) return;
                        await runPlanningMutation(() =>
                          api.projectPlanning.deleteTask({
                            ...planningTarget,
                            taskId: task.id,
                          }),
                        );
                      }}
                      onStatusChange={async (status) => {
                        await runPlanningMutation(() =>
                          api.projectPlanning.updateTask({
                            ...planningTarget,
                            taskId: task.id,
                            status,
                          }),
                        );
                      }}
                      onStartNewThread={() =>
                        startTaskThread({
                          taskId: task.id,
                          task,
                          goalId: selectedGoal.id,
                          goalName: selectedGoal.name,
                        })
                      }
                      onCompleteOccurrence={(occurrenceDate) =>
                        completeTaskOccurrence(task.id, occurrenceDate)
                      }
                      onUncompleteOccurrence={(occurrenceDate) =>
                        uncompleteTaskOccurrence(task.id, occurrenceDate)
                      }
                      onCreateSubtask={(subtaskTask) =>
                        runPlanningMutation(() =>
                          api.projectPlanning.createSubtask({
                            ...planningTarget,
                            taskId: task.id,
                            task: subtaskTask,
                          }),
                        ).then(() => undefined)
                      }
                      onUnlinkThread={(threadId) => detachThreadFromTask(task.id, threadId)}
                      onUpdateSubtask={(subtaskId, patch) =>
                        runPlanningMutation(() =>
                          api.projectPlanning.updateSubtask({
                            ...planningTarget,
                            subtaskId,
                            ...(patch.task !== undefined ? { task: patch.task } : {}),
                            ...(patch.done !== undefined ? { done: patch.done } : {}),
                          }),
                        ).then(() => undefined)
                      }
                      onDeleteSubtask={(subtaskId) =>
                        runPlanningMutation(() =>
                          api.projectPlanning.deleteSubtask({
                            ...planningTarget,
                            subtaskId,
                          }),
                        ).then(() => undefined)
                      }
                    />
                  </div>
                )}
              />
            </div>
          ) : null}
        </div>
      </div>

      <GoalEditorDialog state={goalEditorState} onClose={closeGoalEditor} onSubmit={saveGoalEditor} />
      <TaskEditorDialog state={taskEditorState} onClose={closeTaskEditor} onSubmit={saveTaskEditor} />
      <AttachThreadDialog
        candidates={attachThreadCandidates}
        open={attachThreadDialogTask !== null}
        onAttach={async (threadId) => {
          if (!attachThreadDialogTask) {
            return;
          }
          await attachThreadToTask(attachThreadDialogTask.taskId, threadId);
          const rowKey = attachThreadDialogTask.goalId
            ? goalTaskRowKey(attachThreadDialogTask.goalId, attachThreadDialogTask.taskId)
            : standaloneTaskRowKey(attachThreadDialogTask.taskId);
          openTaskRow(rowKey);
        }}
        onClose={() => setAttachThreadDialogTask(null)}
        taskTitle={attachThreadDialogTask?.task.title ?? ""}
      />
    </>
  );
}
