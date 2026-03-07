import type { ProjectId } from "@t3tools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ListTodoIcon,
  PencilIcon,
  PlusIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import React from "react";

import { ensureNativeApi } from "~/nativeApi";
import {
  createEmptyProjectGoalsDocument,
  createGoal,
  createSubtask,
  createTask,
  normalizeProjectGoalsDocument,
  PROJECT_GOAL_STATUS_LABELS,
  PROJECT_GOAL_STATUS_ORDER,
  type ProjectGoal,
  type ProjectGoalStatus,
  ProjectGoalsDocumentParseError,
  type ProjectTask,
  updateGoalAtIndex,
  updateGoalTaskAtIndex,
  updateStandaloneTaskAtIndex,
} from "~/projectGoals";
import { useStore } from "~/store";
import { toastManager } from "../ui/toast";
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import {
  projectGoalsDocumentQueryOptions,
  projectGoalsQueryKeys,
  projectGoalsWriteMutationOptions,
} from "~/lib/projectGoalsReactQuery";

type GoalEditorState =
  | { mode: "create" }
  | {
      mode: "edit";
      goalIndex: number;
      goal: ProjectGoal;
    };

type TaskEditorState =
  | { mode: "create"; scope: "standalone" }
  | {
      mode: "create";
      scope: "goal";
      goalIndex: number;
    }
  | {
      mode: "edit";
      scope: "standalone";
      taskIndex: number;
      task: ProjectTask;
    }
  | {
      mode: "edit";
      scope: "goal";
      goalIndex: number;
      taskIndex: number;
      task: ProjectTask;
    };

interface IndexedTaskEntry {
  index: number;
  task: ProjectTask;
}

function statusGroupDefaultExpanded(status: ProjectGoalStatus): boolean {
  return status === "working" || status === "scheduled" || status === "planning";
}

function createDefaultStatusGroupState(): Record<ProjectGoalStatus, boolean> {
  return {
    working: true,
    scheduled: true,
    planning: true,
    done: false,
    archived: false,
  };
}

function standaloneTaskRowKey(taskIndex: number): string {
  return `standalone:${taskIndex}`;
}

function goalTaskRowKey(goalIndex: number, taskIndex: number): string {
  return `goal:${goalIndex}:task:${taskIndex}`;
}

function goalOptionKey(goal: ProjectGoal): string {
  return [
    goal.name,
    goal.status,
    goal.tasks.length,
    goal.tasks.map((task) => `${task.title}:${task.status}`).join("|"),
  ].join("::");
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

function groupTaskEntries(tasks: readonly ProjectTask[]): Array<{ status: ProjectGoalStatus; items: IndexedTaskEntry[] }> {
  return PROJECT_GOAL_STATUS_ORDER.map((status) => ({
    status,
    items: tasks
      .map((task, index) => ({ task, index }))
      .filter((entry) => entry.task.status === status),
  }));
}

function findGoalIndexByShape(goals: readonly ProjectGoal[], goal: ProjectGoal): number {
  return goals.findIndex(
    (candidate) =>
      candidate.name === goal.name &&
      candidate.status === goal.status &&
      candidate.tasks.length === goal.tasks.length,
  );
}

function findStandaloneTaskIndexByShape(tasks: readonly ProjectTask[], task: ProjectTask): number {
  return tasks.findIndex(
    (candidate) =>
      candidate.title === task.title &&
      candidate.description === task.description &&
      candidate.status === task.status &&
      candidate.subtasks.length === task.subtasks.length,
  );
}

function findGoalTaskIndexByShape(goal: ProjectGoal, task: ProjectTask): number {
  return goal.tasks.findIndex(
    (candidate) =>
      candidate.title === task.title &&
      candidate.description === task.description &&
      candidate.status === task.status &&
      candidate.subtasks.length === task.subtasks.length,
  );
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
        {PROJECT_GOAL_STATUS_ORDER.map((status) => (
          <SelectItem key={status} value={status}>
            {PROJECT_GOAL_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusGroup({
  title,
  count,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="rounded-2xl border border-border bg-card/80">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <div className="flex items-center gap-3">
            {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            <div>
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">
                {count} {count === 1 ? "item" : "items"}
              </p>
            </div>
          </div>
          <Badge variant="outline">{count}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border/80 px-3 py-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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
  }) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<ProjectGoalStatus>("planning");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setTitle(state.task.title);
      setDescription(state.task.description);
      setStatus(state.task.status);
      return;
    }
    setTitle("");
    setDescription("");
    setStatus("planning");
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        description,
        status,
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
          <DialogDescription>Capture the task, notes, and current status.</DialogDescription>
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
              <Label>Status</Label>
              <StatusSelect value={status} onValueChange={setStatus} ariaLabel="Task status" />
            </div>
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

function TaskCard({
  task,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onStatusChange,
  onSave,
  addSubtaskLabel = "Add Subtask",
}: {
  task: ProjectTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: ProjectGoalStatus) => Promise<void>;
  onSave: (nextTask: ProjectTask) => Promise<void>;
  addSubtaskLabel?: string;
}) {
  const [newSubtask, setNewSubtask] = React.useState("");
  const [editingSubtaskIndex, setEditingSubtaskIndex] = React.useState<number | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = React.useState("");
  const [pendingStatus, setPendingStatus] = React.useState<ProjectGoalStatus>(task.status);

  React.useEffect(() => {
    setPendingStatus(task.status);
  }, [task.status]);

  const submitNewSubtask = async () => {
    const trimmed = newSubtask.trim();
    if (trimmed.length === 0) return;
    await onSave({
      ...task,
      subtasks: [...task.subtasks, createSubtask({ task: trimmed })],
    });
    setNewSubtask("");
  };

  const saveEditedSubtask = async () => {
    if (editingSubtaskIndex === null) return;
    const trimmed = editingSubtaskText.trim();
    if (trimmed.length === 0) return;
    await onSave({
      ...task,
      subtasks: task.subtasks.map((subtask, index) =>
        index === editingSubtaskIndex ? { ...subtask, task: trimmed } : subtask,
      ),
    });
    setEditingSubtaskIndex(null);
    setEditingSubtaskText("");
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="rounded-xl border border-border bg-background/85">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-3 text-left">
            {open ? <ChevronDownIcon className="mt-0.5 size-4 shrink-0" /> : <ChevronRightIcon className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">{task.title || "Untitled task"}</p>
                <StatusBadge status={task.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Subtasks {taskProgressLabel(task)}
              </p>
            </div>
          </CollapsibleTrigger>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusSelect
              value={pendingStatus}
              ariaLabel={`Status for ${task.title || "task"}`}
              onValueChange={async (status) => {
                setPendingStatus(status);
                await onStatusChange(status);
              }}
            />
            <Button size="xs" variant="outline" onClick={() => onOpenChange(true)}>
              {addSubtaskLabel}
            </Button>
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
                      const subtaskKey = `${subtask.task}-${subtask.done ? "done" : "todo"}-${
                        task.subtasks
                          .slice(0, subtaskIndex)
                          .filter(
                            (entry) => entry.task === subtask.task && entry.done === subtask.done,
                          ).length
                      }`;
                      return (
                        <div
                          key={subtaskKey}
                          className="flex items-center gap-3 rounded-lg border border-border/80 px-3 py-2"
                        >
                          <Checkbox
                            checked={subtask.done}
                            aria-label={`Mark ${subtask.task} complete`}
                            onCheckedChange={async (checked) => {
                              await onSave({
                                ...task,
                                subtasks: task.subtasks.map((entry, index) =>
                                  index === subtaskIndex
                                    ? { ...entry, done: Boolean(checked) }
                                    : entry,
                                ),
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
                                onClick={() =>
                                  void onSave({
                                    ...task,
                                    subtasks: task.subtasks.filter((_, index) => index !== subtaskIndex),
                                  })
                                }
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

function InlineEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-muted-foreground">{description}</p>
      <Button className="mt-4" size="sm" variant="outline" onClick={onAction}>
        <PlusIcon />
        {actionLabel}
      </Button>
    </div>
  );
}

export default function ProjectOverviewContent({ projectId }: { projectId: ProjectId }) {
  const project = useStore((store) => store.projects.find((entry) => entry.id === projectId) ?? null);
  const queryClient = useQueryClient();
  const api = ensureNativeApi();

  const [standaloneGroupOpen, setStandaloneGroupOpen] = React.useState<
    Record<ProjectGoalStatus, boolean>
  >(createDefaultStatusGroupState());
  const [goalTaskGroupOpen, setGoalTaskGroupOpen] = React.useState<Record<ProjectGoalStatus, boolean>>(
    createDefaultStatusGroupState(),
  );
  const [openTaskRows, setOpenTaskRows] = React.useState<Record<string, boolean>>({});
  const [goalEditorState, setGoalEditorState] = React.useState<GoalEditorState | null>(null);
  const [taskEditorState, setTaskEditorState] = React.useState<TaskEditorState | null>(null);
  const [selectedTab, setSelectedTab] = React.useState<"tasks" | "goals">("tasks");
  const [selectedGoalIndex, setSelectedGoalIndex] = React.useState(0);

  const projectGoalsQuery = useQuery(projectGoalsDocumentQueryOptions(project?.cwd ?? null));
  const writeMutation = useMutation(
    projectGoalsWriteMutationOptions({
      cwd: project?.cwd ?? null,
      queryClient,
    }),
  );

  const persistDocument = React.useCallback(
    async (nextDocument: ReturnType<typeof normalizeProjectGoalsDocument>) => {
      try {
        await writeMutation.mutateAsync(nextDocument);
        queryClient.setQueryData(projectGoalsQueryKeys.document(project?.cwd ?? null), nextDocument);
        return nextDocument;
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to save project goals",
          description: errorMessage(error),
        });
        throw error;
      }
    },
    [project?.cwd, queryClient, writeMutation],
  );

  const document = projectGoalsQuery.data;
  const goalCount = document?.goals.length ?? 0;

  const openTaskRow = React.useCallback((rowKey: string) => {
    setOpenTaskRows((current) => ({ ...current, [rowKey]: true }));
  }, []);

  React.useEffect(() => {
    if (goalCount === 0) {
      if (selectedGoalIndex !== 0) {
        setSelectedGoalIndex(0);
      }
      return;
    }

    if (selectedGoalIndex > goalCount - 1) {
      setSelectedGoalIndex(goalCount - 1);
    }
  }, [goalCount, selectedGoalIndex]);

  if (!project) {
    return null;
  }

  if (projectGoalsQuery.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl rounded-2xl border border-border bg-card/80 p-6 text-sm text-muted-foreground shadow-sm">
          Loading project goals...
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
                File path: <span className="font-mono">{project.cwd}/.t3code/project-goals.json</span>
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
                    await persistDocument(createEmptyProjectGoalsDocument());
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

  const standaloneGroups = groupTaskEntries(document.tasks);
  const hasAnyGoals = document.goals.length > 0;
  const hasAnyStandaloneTasks = document.tasks.length > 0;
  const isEmpty = !hasAnyGoals && !hasAnyStandaloneTasks;
  const resolvedSelectedGoalIndex = hasAnyGoals
    ? Math.min(selectedGoalIndex, document.goals.length - 1)
    : 0;
  const selectedGoal = document.goals[resolvedSelectedGoalIndex] ?? null;
  const selectedGoalTaskGroups = selectedGoal
    ? groupTaskEntries(selectedGoal.tasks).filter((taskGroup) => taskGroup.items.length > 0)
    : [];

  const saveGoalEditor = async (input: { name: string; status: ProjectGoalStatus }) => {
    if (!goalEditorState) return;
    if (goalEditorState.mode === "create") {
      const nextGoal = createGoal({ name: input.name, status: input.status });
      const nextDocument = normalizeProjectGoalsDocument({
        ...document,
        goals: [...document.goals, nextGoal],
      });
      await persistDocument(nextDocument);
      const nextGoalIndex = findGoalIndexByShape(nextDocument.goals, nextGoal);
      if (nextGoalIndex >= 0) {
        setSelectedTab("goals");
        setSelectedGoalIndex(nextGoalIndex);
      }
      return;
    }

    await persistDocument(
      updateGoalAtIndex(document, goalEditorState.goalIndex, (goal) => ({
        ...goal,
        name: input.name,
        status: input.status,
      })),
    );
  };

  const saveTaskEditor = async (input: {
    title: string;
    description: string;
    status: ProjectGoalStatus;
  }) => {
    if (!taskEditorState) return;

    if (taskEditorState.mode === "create" && taskEditorState.scope === "standalone") {
      const nextTask = createTask(input);
      const nextDocument = normalizeProjectGoalsDocument({
        ...document,
        tasks: [...document.tasks, nextTask],
      });
      await persistDocument(nextDocument);
      const nextTaskIndex = findStandaloneTaskIndexByShape(nextDocument.tasks, nextTask);
      if (nextTaskIndex >= 0) {
        openTaskRow(standaloneTaskRowKey(nextTaskIndex));
      }
      return;
    }

    if (taskEditorState.mode === "create" && taskEditorState.scope === "goal") {
      const nextTask = createTask(input);
      const nextDocument = updateGoalAtIndex(document, taskEditorState.goalIndex, (goal) => ({
        ...goal,
        tasks: [...goal.tasks, nextTask],
      }));
      await persistDocument(nextDocument);
      const nextGoal = nextDocument.goals[taskEditorState.goalIndex];
      if (nextGoal) {
        const nextTaskIndex = findGoalTaskIndexByShape(nextGoal, nextTask);
        if (nextTaskIndex >= 0) {
          openTaskRow(goalTaskRowKey(taskEditorState.goalIndex, nextTaskIndex));
        }
      }
      return;
    }

    if (taskEditorState.mode === "edit" && taskEditorState.scope === "standalone") {
      await persistDocument(
        updateStandaloneTaskAtIndex(document, taskEditorState.taskIndex, (task) => ({
          ...task,
          title: input.title,
          description: input.description,
          status: input.status,
        })),
      );
      return;
    }

    if (taskEditorState.mode === "edit" && taskEditorState.scope === "goal") {
      await persistDocument(
        updateGoalTaskAtIndex(
          document,
          taskEditorState.goalIndex,
          taskEditorState.taskIndex,
          (task) => ({
            ...task,
            title: input.title,
            description: input.description,
            status: input.status,
          }),
        ),
      );
    }
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                  Project Overview
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {project.name}
                </h1>
                <p className="mt-2 break-all text-sm text-muted-foreground">{project.cwd}</p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Goals and tasks for this project
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setGoalEditorState({ mode: "create" })}>
                  <PlusIcon />
                  New Goal
                </Button>
                <Button variant="outline" onClick={() => setTaskEditorState({ mode: "create", scope: "standalone" })}>
                  <PlusIcon />
                  New Task
                </Button>
              </div>
            </div>
          </section>

          {isEmpty ? (
            <section className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center shadow-sm">
              <div className="mx-auto max-w-xl">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-background">
                  <ListTodoIcon className="size-5 text-muted-foreground" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-foreground">No goals or tasks yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create the first project goal or add a standalone task. Planning data stays in
                  a hidden workspace file at <span className="font-mono">.t3code/project-goals.json</span>.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setGoalEditorState({ mode: "create" })}>
                    <PlusIcon />
                    Create first goal
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setTaskEditorState({ mode: "create", scope: "standalone" })}
                  >
                    <PlusIcon />
                    Create standalone task
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {!isEmpty ? (
            <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
              <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as "tasks" | "goals")}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Planning</h2>
                    <p className="text-sm text-muted-foreground">
                      Switch between standalone tasks and project goals.
                    </p>
                  </div>
                  <TabsList aria-label="Project overview sections">
                    <TabsTab value="tasks">
                      <span>Tasks</span>
                      <Badge variant="outline">{document.tasks.length}</Badge>
                    </TabsTab>
                    <TabsTab value="goals">
                      <span>Goals</span>
                      <Badge variant="outline">{document.goals.length}</Badge>
                    </TabsTab>
                  </TabsList>
                </div>

                <TabsPanel className="mt-6" value="tasks">
                  <div className="space-y-4 pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">Tasks</h2>
                        <p className="text-sm text-muted-foreground">
                          Tasks that are not attached to a goal.
                        </p>
                      </div>
                      <Badge variant="outline">{document.tasks.length}</Badge>
                    </div>

                    {!hasAnyStandaloneTasks ? (
                      <InlineEmptyState
                        title="No standalone tasks yet"
                        description="Use standalone tasks for work that does not belong under a larger goal."
                        actionLabel="New Task"
                        onAction={() => setTaskEditorState({ mode: "create", scope: "standalone" })}
                      />
                    ) : (
                      <div className="space-y-3">
                        {standaloneGroups
                          .filter((group) => group.items.length > 0)
                          .map((group) => {
                            const groupOpen =
                              standaloneGroupOpen[group.status] ?? statusGroupDefaultExpanded(group.status);
                            return (
                              <StatusGroup
                                key={group.status}
                                title={PROJECT_GOAL_STATUS_LABELS[group.status]}
                                count={group.items.length}
                                open={groupOpen}
                                onOpenChange={(open) =>
                                  setStandaloneGroupOpen((current) => ({
                                    ...current,
                                    [group.status]: open,
                                  }))
                                }
                              >
                                <div className="space-y-2">
                                  {group.items.map(({ task, index: taskIndex }) => (
                                    <TaskCard
                                      key={`${task.title}-${taskIndex}`}
                                      task={task}
                                      open={openTaskRows[standaloneTaskRowKey(taskIndex)] ?? false}
                                      onOpenChange={(open) =>
                                        setOpenTaskRows((current) => ({
                                          ...current,
                                          [standaloneTaskRowKey(taskIndex)]: open,
                                        }))
                                      }
                                      onEdit={() =>
                                        setTaskEditorState({
                                          mode: "edit",
                                          scope: "standalone",
                                          taskIndex,
                                          task,
                                        })
                                      }
                                      onDelete={async () => {
                                        const confirmed = await api.dialogs.confirm(
                                          `Delete the task "${task.title || "Untitled task"}"?`,
                                        );
                                        if (!confirmed) return;
                                        await persistDocument(
                                          normalizeProjectGoalsDocument({
                                            ...document,
                                            tasks: document.tasks.filter((_, index) => index !== taskIndex),
                                          }),
                                        );
                                      }}
                                      onStatusChange={async (status) => {
                                        await persistDocument(
                                          updateStandaloneTaskAtIndex(document, taskIndex, (entry) => ({
                                            ...entry,
                                            status,
                                          })),
                                        );
                                      }}
                                      onSave={async (nextTask) => {
                                        await persistDocument(
                                          updateStandaloneTaskAtIndex(document, taskIndex, () => nextTask),
                                        );
                                      }}
                                    />
                                  ))}
                                </div>
                              </StatusGroup>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </TabsPanel>

                <TabsPanel className="mt-6" value="goals">
                  <div className="space-y-4 pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">Goals</h2>
                        <p className="text-sm text-muted-foreground">
                          High-level project outcomes with nested tasks.
                        </p>
                      </div>
                      <Badge variant="outline">{document.goals.length}</Badge>
                    </div>

                    {!hasAnyGoals ? (
                      <InlineEmptyState
                        title="No goals yet"
                        description="Create a goal to organize related tasks under a shared outcome."
                        actionLabel="New Goal"
                        onAction={() => setGoalEditorState({ mode: "create" })}
                      />
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="project-overview-goal-selector">Goal</Label>
                          <Select
                            value={String(resolvedSelectedGoalIndex)}
                            onValueChange={(value) => setSelectedGoalIndex(Number(value))}
                          >
                            <SelectTrigger
                              id="project-overview-goal-selector"
                              aria-label="Selected goal"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {document.goals.map((goal, goalIndex) => (
                                <SelectItem key={goalOptionKey(goal)} value={String(goalIndex)}>
                                  {goal.name || `Untitled goal ${goalIndex + 1}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedGoal ? (
                          <>
                            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-background/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-base font-medium text-foreground">
                                    {selectedGoal.name || "Untitled goal"}
                                  </h3>
                                  <StatusBadge status={selectedGoal.status} />
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {selectedGoal.tasks.length}{" "}
                                  {selectedGoal.tasks.length === 1 ? "task" : "tasks"}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() =>
                                    setGoalEditorState({
                                      mode: "edit",
                                      goalIndex: resolvedSelectedGoalIndex,
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
                                      goalIndex: resolvedSelectedGoalIndex,
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
                                    void persistDocument(
                                      updateGoalAtIndex(document, resolvedSelectedGoalIndex, (entry) => ({
                                        ...entry,
                                        status: entry.status === "archived" ? "planning" : "archived",
                                      })),
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
                                    await persistDocument(
                                      normalizeProjectGoalsDocument({
                                        ...document,
                                        goals: document.goals.filter(
                                          (_, index) => index !== resolvedSelectedGoalIndex,
                                        ),
                                      }),
                                    );
                                  }}
                                >
                                  <Trash2Icon />
                                  Delete
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                                    Goal Tasks
                                  </p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Tasks remain independent from the goal status.
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setTaskEditorState({
                                      mode: "create",
                                      scope: "goal",
                                      goalIndex: resolvedSelectedGoalIndex,
                                    })
                                  }
                                >
                                  <PlusIcon />
                                  New Task
                                </Button>
                              </div>

                              {selectedGoalTaskGroups.length === 0 ? (
                                <InlineEmptyState
                                  title="No tasks for this goal"
                                  description="Add a task to start breaking the goal into concrete work."
                                  actionLabel="New Task"
                                  onAction={() =>
                                    setTaskEditorState({
                                      mode: "create",
                                      scope: "goal",
                                      goalIndex: resolvedSelectedGoalIndex,
                                    })
                                  }
                                />
                              ) : (
                                <div className="space-y-3">
                                  {selectedGoalTaskGroups.map((taskGroup) => {
                                    const groupOpen =
                                      goalTaskGroupOpen[taskGroup.status] ??
                                      statusGroupDefaultExpanded(taskGroup.status);
                                    return (
                                      <StatusGroup
                                        key={`${resolvedSelectedGoalIndex}-${taskGroup.status}`}
                                        title={PROJECT_GOAL_STATUS_LABELS[taskGroup.status]}
                                        count={taskGroup.items.length}
                                        open={groupOpen}
                                        onOpenChange={(open) =>
                                          setGoalTaskGroupOpen((current) => ({
                                            ...current,
                                            [taskGroup.status]: open,
                                          }))
                                        }
                                      >
                                        <div className="space-y-2">
                                          {taskGroup.items.map(({ task, index: taskIndex }) => (
                                            <TaskCard
                                              key={`${resolvedSelectedGoalIndex}-${task.title}-${taskIndex}`}
                                              task={task}
                                              open={
                                                openTaskRows[
                                                  goalTaskRowKey(resolvedSelectedGoalIndex, taskIndex)
                                                ] ?? false
                                              }
                                              onOpenChange={(open) =>
                                                setOpenTaskRows((current) => ({
                                                  ...current,
                                                  [goalTaskRowKey(resolvedSelectedGoalIndex, taskIndex)]:
                                                    open,
                                                }))
                                              }
                                              onEdit={() =>
                                                setTaskEditorState({
                                                  mode: "edit",
                                                  scope: "goal",
                                                  goalIndex: resolvedSelectedGoalIndex,
                                                  taskIndex,
                                                  task,
                                                })
                                              }
                                              onDelete={async () => {
                                                const confirmed = await api.dialogs.confirm(
                                                  `Delete the task "${task.title || "Untitled task"}"?`,
                                                );
                                                if (!confirmed) return;
                                                await persistDocument(
                                                  updateGoalAtIndex(
                                                    document,
                                                    resolvedSelectedGoalIndex,
                                                    (entry) => ({
                                                      ...entry,
                                                      tasks: entry.tasks.filter(
                                                        (_, index) => index !== taskIndex,
                                                      ),
                                                    }),
                                                  ),
                                                );
                                              }}
                                              onStatusChange={async (status) => {
                                                await persistDocument(
                                                  updateGoalTaskAtIndex(
                                                    document,
                                                    resolvedSelectedGoalIndex,
                                                    taskIndex,
                                                    (entry) => ({ ...entry, status }),
                                                  ),
                                                );
                                              }}
                                              onSave={async (nextTask) => {
                                                await persistDocument(
                                                  updateGoalTaskAtIndex(
                                                    document,
                                                    resolvedSelectedGoalIndex,
                                                    taskIndex,
                                                    () => nextTask,
                                                  ),
                                                );
                                              }}
                                            />
                                          ))}
                                        </div>
                                      </StatusGroup>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </TabsPanel>
              </Tabs>
            </section>
          ) : null}
        </div>
      </div>

      <GoalEditorDialog
        state={goalEditorState}
        onClose={() => setGoalEditorState(null)}
        onSubmit={saveGoalEditor}
      />
      <TaskEditorDialog
        state={taskEditorState}
        onClose={() => setTaskEditorState(null)}
        onSubmit={saveTaskEditor}
      />
    </>
  );
}
