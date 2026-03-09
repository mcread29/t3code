import type { ProjectId } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "~/projectGoals";
import { useStore } from "~/store";
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
import TaskKanbanBoard from "./TaskKanbanBoard";
import type { ProjectOverviewSection } from "./ProjectOverviewLayout";

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
  onCreateSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
  addSubtaskLabel = "Add Subtask",
}: {
  task: ProjectTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: ProjectGoalStatus) => Promise<void>;
  onCreateSubtask: (task: string) => Promise<void>;
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
                <StatusBadge status={task.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Subtasks {taskProgressLabel(task)}</p>
            </div>
          </CollapsibleTrigger>
          <div className="flex flex-wrap items-center gap-2">
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
  onGoalEditorOpenChange,
  onTaskEditorOpenChange,
  projectId,
  taskEditorOpen,
}: {
  activeSection: ProjectOverviewSection;
  goalEditorOpen: boolean;
  onGoalEditorOpenChange: (open: boolean) => void;
  onTaskEditorOpenChange: (open: boolean) => void;
  projectId: ProjectId;
  taskEditorOpen: boolean;
}) {
  const project = useStore((store) => store.projects.find((entry) => entry.id === projectId) ?? null);
  const queryClient = useQueryClient();
  const api = ensureNativeApi();

  const [openTaskRows, setOpenTaskRows] = React.useState<Record<string, boolean>>({});
  const [goalEditorState, setGoalEditorState] = React.useState<GoalEditorState | null>(null);
  const [taskEditorState, setTaskEditorState] = React.useState<TaskEditorState | null>(null);
  const [showArchivedStandaloneTasks, setShowArchivedStandaloneTasks] = React.useState(false);
  const [showArchivedGoalTasks, setShowArchivedGoalTasks] = React.useState(false);

  const projectGoalsQuery = useQuery(
    projectPlanningSnapshotQueryOptions({
      projectId,
      cwd: project?.cwd ?? null,
    }),
  );
  const snapshotQueryKey = projectPlanningQueryKeys.snapshot(projectId, project?.cwd ?? null);

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
      projectId,
      ...(project?.cwd ? { workspaceRoot: project.cwd } : {}),
      ...(projectGoalsQuery.data?.revision
        ? { expectedRevision: projectGoalsQuery.data.revision }
        : {}),
    }),
    [project?.cwd, projectGoalsQuery.data?.revision, projectId],
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

  const openTaskRow = React.useCallback((rowKey: string) => {
    setOpenTaskRows((current) => ({ ...current, [rowKey]: true }));
  }, []);

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
                    await api.projects.writeFile({
                      cwd: project.cwd,
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
  }) => {
    if (!taskEditorState) return;

    if (taskEditorState.mode === "create" && taskEditorState.scope === "standalone") {
      const result = await runPlanningMutation(() =>
        api.projectPlanning.createTask({
          ...planningTarget,
          title: input.title,
          description: input.description,
          status: input.status,
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
        }),
      );
    }
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-6xl">
          {activeSection.kind === "standalone-tasks" ? (
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
                title: "No standalone tasks yet",
                description: "Use standalone tasks for work that does not belong under a larger goal.",
                actionLabel: "New Task",
                onAction: () => setTaskEditorState({ mode: "create", scope: "standalone" }),
              }}
              filteredEmptyState={{
                title: "No visible standalone tasks",
                description: "Archived tasks are hidden. Turn on Show archived to view them.",
              }}
              renderTask={(task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  open={openTaskRows[standaloneTaskRowKey(task.id)] ?? false}
                  onOpenChange={(open) =>
                    setOpenTaskRows((current) => ({
                      ...current,
                      [standaloneTaskRowKey(task.id)]: open,
                    }))
                  }
                  onEdit={() =>
                    setTaskEditorState({
                      mode: "edit",
                      scope: "standalone",
                      taskId: task.id,
                      task,
                    })
                  }
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
                  onCreateSubtask={(subtaskTask) =>
                    runPlanningMutation(() =>
                      api.projectPlanning.createSubtask({
                        ...planningTarget,
                        taskId: task.id,
                        task: subtaskTask,
                      }),
                    ).then(() => undefined)
                  }
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
                renderTask={(task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    open={openTaskRows[goalTaskRowKey(selectedGoal.id, task.id)] ?? false}
                    onOpenChange={(open) =>
                      setOpenTaskRows((current) => ({
                        ...current,
                        [goalTaskRowKey(selectedGoal.id, task.id)]: open,
                      }))
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
                    onCreateSubtask={(subtaskTask) =>
                      runPlanningMutation(() =>
                        api.projectPlanning.createSubtask({
                          ...planningTarget,
                          taskId: task.id,
                          task: subtaskTask,
                        }),
                      ).then(() => undefined)
                    }
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
                )}
              />
            </div>
          ) : null}
        </div>
      </div>

      <GoalEditorDialog state={goalEditorState} onClose={closeGoalEditor} onSubmit={saveGoalEditor} />
      <TaskEditorDialog state={taskEditorState} onClose={closeTaskEditor} onSubmit={saveTaskEditor} />
    </>
  );
}
