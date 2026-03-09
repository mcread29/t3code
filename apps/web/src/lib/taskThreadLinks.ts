import type { ProjectId, ThreadId } from "@t3tools/contracts";
import {
  findTasksLinkedToThread,
  PROJECT_GOAL_STATUS_LABELS,
  type LinkedProjectTaskLocation,
  type ProjectGoalsDocument,
  type ProjectTask,
} from "@t3tools/shared/projectGoals";

import type { DraftThreadState } from "~/composerDraftStore";
import type { Thread } from "~/types";

export interface TaskThreadCandidate {
  id: string;
  title: string;
  kind: "thread" | "draft";
  statusLabel: string;
  threadId: string;
}

export interface LinkedThreadPresentation {
  id: string;
  title: string;
  kind: "thread" | "draft" | "missing";
  statusLabel: string;
  threadId: string;
}

export function buildTaskThreadTitle(task: ProjectTask): string {
  const trimmedTitle = task.title.trim();
  return trimmedTitle.length > 0 ? `Task: ${trimmedTitle}` : "Task thread";
}

export function buildTaskKickoffPrompt(input: {
  goalName?: string;
  task: ProjectTask;
}): string {
  const lines = ["Work on this task:", "", `Task: ${input.task.title || "Untitled task"}`];
  if (input.goalName && input.goalName.trim().length > 0) {
    lines.push(`Goal: ${input.goalName}`);
  }
  lines.push(`Status: ${PROJECT_GOAL_STATUS_LABELS[input.task.status]}`, "", "Description:");
  lines.push(input.task.description.trim().length > 0 ? input.task.description : "No description provided.");
  lines.push("", "Subtasks:");
  if (input.task.subtasks.length === 0) {
    lines.push("- [ ] No subtasks yet");
  } else {
    for (const subtask of input.task.subtasks) {
      lines.push(`- [${subtask.done ? "x" : " "}] ${subtask.task}`);
    }
  }
  return lines.join("\n");
}

export function toProjectOverviewTaskSearch(location: LinkedProjectTaskLocation): {
  goalId: string | undefined;
  taskId: string | undefined;
} {
  return location.scope === "goal"
    ? { goalId: location.goal.id, taskId: location.task.id }
    : { goalId: undefined, taskId: location.task.id };
}

export function findLinkedTasksForThread(
  document: ProjectGoalsDocument | undefined,
  threadId: string | null | undefined,
): LinkedProjectTaskLocation[] {
  if (!document || !threadId) {
    return [];
  }
  return findTasksLinkedToThread(document, threadId);
}

export function getTaskThreadCandidates(input: {
  projectId: ProjectId;
  linkedThreadIds: readonly string[];
  threads: readonly Thread[];
  draftThread: ({ threadId: ThreadId } & DraftThreadState) | null;
}): TaskThreadCandidate[] {
  const linkedIds = new Set(input.linkedThreadIds);
  const candidates: TaskThreadCandidate[] = [];

  for (const thread of input.threads) {
    if (thread.projectId !== input.projectId || linkedIds.has(thread.id)) {
      continue;
    }
    candidates.push({
      id: thread.id,
      title: thread.title,
      kind: "thread",
      statusLabel: thread.session?.status ?? "closed",
      threadId: thread.id,
    });
  }

  if (
    input.draftThread &&
    input.draftThread.projectId === input.projectId &&
    !linkedIds.has(input.draftThread.threadId)
  ) {
    candidates.push({
      id: input.draftThread.threadId,
      title: buildDraftThreadLabel(input.draftThread),
      kind: "draft",
      statusLabel: "draft",
      threadId: input.draftThread.threadId,
    });
  }

  return candidates.toSorted((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

export function presentLinkedThreads(input: {
  linkedThreadIds: readonly string[];
  threads: readonly Thread[];
  draftThread: ({ threadId: ThreadId } & DraftThreadState) | null;
}): LinkedThreadPresentation[] {
  return input.linkedThreadIds.map((threadId) => {
    const thread = input.threads.find((entry) => entry.id === threadId);
    if (thread) {
      return {
        id: thread.id,
        title: thread.title,
        kind: "thread",
        statusLabel: thread.session?.status ?? "closed",
        threadId: thread.id,
      };
    }

    if (input.draftThread?.threadId === threadId) {
      return {
        id: threadId,
        title: buildDraftThreadLabel(input.draftThread),
        kind: "draft",
        statusLabel: "draft",
        threadId,
      };
    }

    return {
      id: threadId,
      title: "Unknown thread",
      kind: "missing",
      statusLabel: "missing",
      threadId,
    };
  });
}

function buildDraftThreadLabel(draftThread: DraftThreadState): string {
  if (draftThread.title && draftThread.title.trim().length > 0) {
    return draftThread.title;
  }
  return draftThread.worktreePath ? "Draft thread (worktree)" : "Draft thread";
}
