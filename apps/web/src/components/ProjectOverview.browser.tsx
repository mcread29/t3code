import "../index.css";

import type { NativeApi, ProjectId } from "@t3tools/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import {
  addGoal,
  addStandaloneTask,
  addTaskToGoal,
  createGoal,
  createTask,
  parseProjectGoalsDocument,
  updateTask,
  type ProjectGoalsDocument,
} from "../projectGoals";
import { formatScheduledDate, getLocalIsoDate } from "../lib/taskSchedule";
import { useStore } from "../store";
import ProjectOverview from "./ProjectOverview";
import ProjectOverviewLayout from "./project-overview/ProjectOverviewLayout";

const PROJECT_ID = "project-overview-test" as ProjectId;
const PROJECT_CWD = "/repo/project-overview";

let currentNativeApi: NativeApi;

vi.mock("~/nativeApi", () => ({
  ensureNativeApi: () => currentNativeApi,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function buildNativeApi(input: {
  readFile: (input: { cwd: string; relativePath: string }) => Promise<{
    relativePath: string;
    contents: string | null;
  }>;
  writeFile?: (input: {
    cwd: string;
    relativePath: string;
    contents: string;
  }) => Promise<{ relativePath: string }>;
  confirm?: (message: string) => Promise<boolean>;
  createGoal?: (input: { name: string; status?: string }) => Promise<unknown>;
  createTask?: (input: {
    goalId?: string;
    title: string;
    description?: string;
    status?: string;
    scheduledDate?: string;
    recurrence?: {
      startDate: string;
      rule:
        | { kind: "daily"; interval: number }
        | { kind: "weekly"; interval: number; weekdays: readonly string[] }
        | { kind: "monthly-day"; interval: number; dayOfMonth: number }
        | { kind: "monthly-ordinal-weekday"; interval: number; ordinal: string; weekday: string }
        | { kind: "yearly-date"; interval: number; month: number; dayOfMonth: number }
        | { kind: "yearly-ordinal-weekday"; interval: number; month: number; ordinal: string; weekday: string };
      completionDates: readonly string[];
    } | null;
  }) => Promise<unknown>;
  updateTask?: (input: {
    taskId: string;
    title?: string;
    description?: string;
    status?: string;
    scheduledDate?: string | null;
    recurrence?: {
      startDate: string;
      rule:
        | { kind: "daily"; interval: number }
        | { kind: "weekly"; interval: number; weekdays: readonly string[] }
        | { kind: "monthly-day"; interval: number; dayOfMonth: number }
        | { kind: "monthly-ordinal-weekday"; interval: number; ordinal: string; weekday: string }
        | { kind: "yearly-date"; interval: number; month: number; dayOfMonth: number }
        | { kind: "yearly-ordinal-weekday"; interval: number; month: number; ordinal: string; weekday: string };
      completionDates: readonly string[];
    } | null;
  }) => Promise<unknown>;
  completeTaskOccurrence?: (input: { taskId: string; occurrenceDate: string }) => Promise<unknown>;
  uncompleteTaskOccurrence?: (input: { taskId: string; occurrenceDate: string }) => Promise<unknown>;
}): NativeApi {
  let document: ProjectGoalsDocument | null = null;
  let revision = 1;

  const ensureDocument = async () => {
    if (document) {
      return document;
    }

    const result = await input.readFile({
      cwd: PROJECT_CWD,
      relativePath: ".t3code/project-goals.json",
    });
    document = parseProjectGoalsDocument(result.contents);
    return document;
  };

  const buildSnapshot = async () => ({
    revision: `rev-${revision}`,
    document: await ensureDocument(),
  });

  const createGoalMock =
    input.createGoal ??
    vi.fn(async ({ name, status }) => {
      const nextGoal = createGoal({ name, status: status ?? "planning" });
      document = addGoal(await ensureDocument(), nextGoal);
      revision += 1;
      return {
        type: "success" as const,
        changedId: nextGoal.id,
        snapshot: await buildSnapshot(),
      };
    });

  const createTaskMock =
    input.createTask ??
    vi.fn(async ({ goalId, title, description, status, scheduledDate, recurrence }) => {
      const nextTask = createTask({
        title,
        description: description ?? "",
        status: status ?? "planning",
        scheduledDate: scheduledDate ?? null,
        recurrence: recurrence ?? null,
      });
      document = goalId
        ? (addTaskToGoal(await ensureDocument(), goalId, nextTask) ?? (await ensureDocument()))
        : addStandaloneTask(await ensureDocument(), nextTask);
      revision += 1;
      return {
        type: "success" as const,
        changedId: nextTask.id,
        snapshot: await buildSnapshot(),
      };
    });

  const updateTaskMock =
    input.updateTask ??
    vi.fn(async ({ taskId, title, description, status, scheduledDate, recurrence }) => {
      document =
        updateTask(await ensureDocument(), taskId, (task) => ({
          ...task,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(scheduledDate !== undefined ? { scheduledDate } : {}),
          ...(recurrence !== undefined ? { recurrence } : {}),
        })) ?? (await ensureDocument());
      revision += 1;
      return {
        type: "success" as const,
        changedId: taskId,
        snapshot: await buildSnapshot(),
      };
    });

  const completeTaskOccurrenceMock =
    input.completeTaskOccurrence ??
    vi.fn(async ({ taskId, occurrenceDate }) => {
      document =
        updateTask(await ensureDocument(), taskId, (task) => ({
          ...task,
          recurrence: task.recurrence
            ? {
                ...task.recurrence,
                completionDates: [...task.recurrence.completionDates, occurrenceDate],
              }
            : null,
        })) ?? (await ensureDocument());
      revision += 1;
      return {
        type: "success" as const,
        changedId: taskId,
        snapshot: await buildSnapshot(),
      };
    });

  const uncompleteTaskOccurrenceMock =
    input.uncompleteTaskOccurrence ??
    vi.fn(async ({ taskId, occurrenceDate }) => {
      document =
        updateTask(await ensureDocument(), taskId, (task) => ({
          ...task,
          recurrence: task.recurrence
            ? {
                ...task.recurrence,
                completionDates: task.recurrence.completionDates.filter(
                  (entry) => entry !== occurrenceDate,
                ),
              }
            : null,
        })) ?? (await ensureDocument());
      revision += 1;
      return {
        type: "success" as const,
        changedId: taskId,
        snapshot: await buildSnapshot(),
      };
    });

  return {
    projects: {
      readFile: input.readFile,
      writeFile: input.writeFile ?? vi.fn().mockResolvedValue({ relativePath: ".t3code/project-goals.json" }),
    },
    dialogs: {
      confirm: input.confirm ?? vi.fn().mockResolvedValue(true),
    },
    projectPlanning: {
      getSnapshot: vi.fn(async () => ({
        type: "success" as const,
        snapshot: await buildSnapshot(),
      })),
      createGoal: createGoalMock,
      updateGoal: vi.fn(),
      deleteGoal: vi.fn(),
      createTask: createTaskMock,
      updateTask: updateTaskMock,
      deleteTask: vi.fn(),
      completeTaskOccurrence: completeTaskOccurrenceMock,
      uncompleteTaskOccurrence: uncompleteTaskOccurrenceMock,
      attachThreadToTask: vi.fn(),
      detachThreadFromTask: vi.fn(),
      createSubtask: vi.fn(),
      updateSubtask: vi.fn(),
      deleteSubtask: vi.fn(),
      onUpdated: vi.fn(() => () => {}),
    },
  } as unknown as NativeApi;
}

async function mountOverview() {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectOverview projectId={PROJECT_ID} />
    </QueryClientProvider>,
  );
}

async function mountHomeOverviewLayout() {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectOverviewLayout
        loadingLabel="Loading home goals..."
        navigationLabel="Home navigation"
        projectId={null}
        showCalendarEntry
        subtitle={PROJECT_CWD}
        threadProjectId={PROJECT_ID}
        title="Home"
        workspaceRoot={PROJECT_CWD}
      />
    </QueryClientProvider>,
  );
}

async function setViewport() {
  await page.viewport(1280, 1000);
}

function taskBoard() {
  return page.getByTestId("task-kanban-board");
}

beforeEach(async () => {
  await setViewport();
  useStore.setState({
    projects: [
      {
        id: PROJECT_ID,
        name: "Project Overview Test",
        cwd: PROJECT_CWD,
        model: "gpt-5",
        expanded: true,
        scripts: [],
      },
    ],
    threads: [],
    threadsHydrated: true,
  });
});

afterEach(() => {
  useStore.setState({
    projects: [],
    threads: [],
    threadsHydrated: false,
  });
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ProjectOverview", () => {
  it("shows a compact header with the project name, path, and primary actions", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: null,
      }),
    });

    const screen = await mountOverview();

    await expect.element(page.getByRole("heading", { name: "Project Overview Test" })).toBeVisible();
    await expect.element(page.getByText(PROJECT_CWD)).toBeVisible();
    await expect.element(page.getByRole("button", { name: "New Goal" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "New Task" }).first()).toBeVisible();

    await screen.unmount();
  });

  it("renders tasks and all goals in the project nav", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [
            {
              name: "Launch beta",
              status: "working",
              tasks: [],
            },
            {
              name: "Stabilize editor",
              status: "planning",
              tasks: [],
            },
          ],
          tasks: [
            {
              title: "Sweep dead code",
              description: "",
              status: "working",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();
    const desktopNav = screen.container.querySelector("aside");
    const navButtonLabels = Array.from(
      desktopNav?.querySelectorAll("button[aria-label]") ?? [],
    ).map((button) => button.getAttribute("aria-label"));

    expect(navButtonLabels.slice(0, 2)).toEqual(["Calendar", "Tasks"]);
    await expect.element(page.getByRole("button", { name: "Calendar" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Tasks" })).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect.element(page.getByRole("button", { name: "Launch beta" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Stabilize editor" })).toBeVisible();
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();

    await screen.unmount();
  });

  it("switches to the calendar view and renders the current month grid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 4,
          goals: [
            {
              id: "goal_1",
              name: "Launch beta",
              status: "working",
              tasks: [
                {
                  id: "task_goal",
                  title: "Beta rehearsal",
                  description: "",
                  status: "scheduled",
                  scheduledDate: "2026-03-22",
                  subtasks: [],
                  linkedThreadIds: [],
                },
              ],
            },
          ],
          tasks: [
            {
              id: "task_1",
              title: "Sweep dead code",
              description: "",
              status: "planning",
              scheduledDate: "2026-03-20",
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Calendar" }).click();

    await expect.element(page.getByTestId("project-calendar-view")).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "March 2026" })).toBeVisible();
    await expect.element(page.getByTestId("calendar-day-2026-03-01")).toHaveAttribute(
      "data-current-month",
      "true",
    );
    await expect.element(page.getByTestId("calendar-day-2026-04-04")).toHaveAttribute(
      "data-current-month",
      "false",
    );
    expect(
      screen.container.querySelector('[data-testid="calendar-day-2026-03-20"]')?.textContent,
    ).toContain("Sweep dead code");
    expect(
      screen.container.querySelector('[data-testid="calendar-day-2026-03-22"]')?.textContent,
    ).toContain("Beta rehearsal");

    await screen.unmount();
  });

  it("switches from tasks to a selected goal without tabs", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [
            {
              name: "Launch beta",
              status: "working",
              tasks: [
                {
                  title: "Polish onboarding",
                  description: "Tighten the setup flow",
                  status: "scheduled",
                  subtasks: [{ task: "Review copy", done: true }],
                },
              ],
            },
          ],
          tasks: [
            {
              title: "Sweep dead code",
              description: "",
              status: "done",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Launch beta" }).click();

    await expect.element(page.getByRole("button", { name: "Launch beta" })).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect.element(page.getByText("Polish onboarding")).toBeVisible();
    await expect.element(page.getByText("Sweep dead code")).not.toBeInTheDocument();
    await expect.element(page.getByRole("tab", { name: /Tasks/i })).not.toBeInTheDocument();
    await expect.element(page.getByRole("tab", { name: /Goals/i })).not.toBeInTheDocument();

    await screen.unmount();
  });

  it("keeps the standalone board visible when the project nav is collapsed and expanded on desktop", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [
            {
              name: "Launch beta",
              status: "working",
              tasks: [],
            },
          ],
          tasks: [
            {
              title: "Sweep dead code",
              description: "",
              status: "working",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    const sidebarToggle = page.getByRole("button", { name: "Toggle Sidebar" }).first();

    await expect.element(page.getByLabelText("Tasks", { exact: true })).toBeVisible();
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "columns");
    await sidebarToggle.click();
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();
    await expect.element(taskBoard()).toBeVisible();
    await sidebarToggle.click();
    await expect.element(page.getByLabelText("Tasks", { exact: true })).toBeVisible();
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "columns");

    await screen.unmount();
  });

  it("hides archived tasks by default and reveals them with the board toggle", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [
            {
              name: "Launch beta",
              status: "working",
              tasks: [
                {
                  title: "Archive docs",
                  description: "",
                  status: "archived",
                  subtasks: [],
                },
              ],
            },
          ],
          tasks: [
            {
              title: "Archive cleanup",
              description: "",
              status: "archived",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect.element(page.getByText("Archive cleanup")).not.toBeInTheDocument();
    await expect.element(page.getByText("Archive docs")).not.toBeInTheDocument();
    await expect.element(page.getByRole("switch", { name: "Show archived" })).toBeVisible();

    await page.getByRole("switch", { name: "Show archived" }).click();

    await expect.element(page.getByText("Archive cleanup")).toBeVisible();
    await expect.element(page.getByLabelText("Archived tasks")).toBeVisible();
    await expect.element(page.getByText("Archive docs")).not.toBeInTheDocument();

    await screen.unmount();
  });

  it("stacks task categories vertically when the board is too narrow", async () => {
    await page.viewport(900, 1000);
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [],
          tasks: [
            {
              title: "Plan rollout",
              description: "",
              status: "planning",
              subtasks: [],
            },
            {
              title: "Queue review",
              description: "",
              status: "scheduled",
              subtasks: [],
            },
            {
              title: "Ship patch",
              description: "",
              status: "working",
              subtasks: [],
            },
            {
              title: "Write recap",
              description: "",
              status: "done",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect.element(taskBoard()).toHaveAttribute("data-layout", "stacked");

    await screen.unmount();
  });

  it("stacks goal task categories vertically when the board is too narrow", async () => {
    await page.viewport(900, 1000);
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [
            {
              name: "Launch beta",
              status: "working",
              tasks: [
                {
                  title: "Plan rollout",
                  description: "",
                  status: "planning",
                  subtasks: [],
                },
                {
                  title: "Queue review",
                  description: "",
                  status: "scheduled",
                  subtasks: [],
                },
                {
                  title: "Ship patch",
                  description: "",
                  status: "working",
                  subtasks: [],
                },
                {
                  title: "Write recap",
                  description: "",
                  status: "done",
                  subtasks: [],
                },
              ],
            },
          ],
          tasks: [],
        }),
      }),
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Launch beta" }).click();
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "stacked");

    await screen.unmount();
  });

  it("switches the task board back to columns when enough width becomes available", async () => {
    await page.viewport(900, 1000);
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [],
          tasks: [
            {
              title: "Plan rollout",
              description: "",
              status: "planning",
              subtasks: [],
            },
            {
              title: "Queue review",
              description: "",
              status: "scheduled",
              subtasks: [],
            },
            {
              title: "Ship patch",
              description: "",
              status: "working",
              subtasks: [],
            },
            {
              title: "Write recap",
              description: "",
              status: "done",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect.element(taskBoard()).toHaveAttribute("data-layout", "stacked");

    await page.viewport(1400, 1000);
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "columns");

    await screen.unmount();
  });

  it("auto-collapses task details in stacked task boards", async () => {
    await page.viewport(900, 1000);
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 4,
          goals: [],
          tasks: [
            {
              id: "task_1",
              title: "Plan rollout",
              description: "First description",
              status: "planning",
              scheduledDate: null,
              subtasks: [],
              linkedThreadIds: [],
            },
            {
              id: "task_2",
              title: "Ship patch",
              description: "Second description",
              status: "working",
              scheduledDate: null,
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect.element(taskBoard()).toHaveAttribute("data-layout", "stacked");

    await page.getByRole("button", { name: /Plan rollout/ }).click();
    await expect.element(page.getByText("First description")).toBeVisible();

    await page.getByRole("button", { name: /Ship patch/ }).click();
    await expect.element(page.getByText("Second description")).toBeVisible();
    await expect.element(page.getByText("First description")).not.toBeInTheDocument();

    await screen.unmount();
  });

  it("recomputes the task board layout when archived visibility adds another category", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [],
          tasks: [
            {
              title: "Plan rollout",
              description: "",
              status: "planning",
              subtasks: [],
            },
            {
              title: "Queue review",
              description: "",
              status: "scheduled",
              subtasks: [],
            },
            {
              title: "Ship patch",
              description: "",
              status: "working",
              subtasks: [],
            },
            {
              title: "Write recap",
              description: "",
              status: "done",
              subtasks: [],
            },
            {
              title: "Archive notes",
              description: "",
              status: "archived",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect.element(taskBoard()).toHaveAttribute("data-layout", "columns");
    await page.getByRole("switch", { name: "Show archived" }).click();
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "stacked");

    await screen.unmount();
  });

  it("opens the task dialog from the header even when only goals exist", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [{ name: "Ship beta", status: "planning", tasks: [] }],
          tasks: [],
        }),
      }),
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "New Task" }).first().click();

    await expect.element(page.getByRole("dialog")).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "New Task" })).toBeVisible();
    await expect.element(page.getByLabelText("Title")).toBeVisible();
    await expect.element(page.getByLabelText("Task schedule mode")).toBeVisible();

    await screen.unmount();
  });

  it("creates the first goal through the project planning mutation", async () => {
    const createGoalMock = vi.fn(async ({ name, status }) => ({
      type: "success" as const,
      changedId: "goal_1",
      snapshot: {
        revision: "rev-2",
        document: {
          version: 4 as const,
          goals: [
            {
              id: "goal_1",
              name,
              status: status ?? "planning",
              tasks: [],
            },
          ],
          tasks: [],
        },
      },
    }));
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: null,
      }),
      createGoal: createGoalMock,
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "New Goal" }).click();
    await page.getByLabelText("Name").fill("Ship v1");
    await page.getByRole("button", { name: "Create Goal" }).click();

    expect(createGoalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ship v1",
      }),
    );
    await expect.element(page.getByRole("button", { name: "Ship v1" })).toBeVisible();

    await screen.unmount();
  });

  it("renders scheduled and overdue badges for tasks", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 4,
          goals: [],
          tasks: [
            {
              id: "task_future",
              title: "Future task",
              description: "",
              status: "planning",
              scheduledDate: "2099-03-20",
              subtasks: [],
              linkedThreadIds: [],
            },
            {
              id: "task_overdue",
              title: "Overdue task",
              description: "",
              status: "planning",
              scheduledDate: "2020-01-01",
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect.element(page.getByText(/Scheduled .*2099/)).toBeVisible();
    await expect.element(page.getByText(/Overdue .*2020/)).toBeVisible();

    await screen.unmount();
  });

  it("saves and clears a scheduled date from the task editor", async () => {
    const updateTaskMock = vi.fn(async ({ taskId, scheduledDate }) => ({
      type: "success" as const,
      changedId: taskId,
      snapshot: {
        revision: scheduledDate === null ? "rev-3" : "rev-2",
        document: {
          version: 5 as const,
          goals: [],
          tasks: [
            {
              id: "task_1",
              title: "Task",
              description: "",
              status: "planning",
              scheduledDate,
              recurrence: null,
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        },
      },
    }));
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 4,
          goals: [],
          tasks: [
            {
              id: "task_1",
              title: "Task",
              description: "",
              status: "planning",
              scheduledDate: null,
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
      updateTask: updateTaskMock,
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabelText("Task schedule mode").click();
    await page.getByRole("option", { name: "One-time" }).click();
    await page.getByLabelText("Scheduled Date").fill("2099-03-20");
    await page.getByRole("button", { name: "Save Task" }).click();

    expect(updateTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task_1",
        scheduledDate: "2099-03-20",
      }),
    );
    await expect.element(page.getByText(/Scheduled .*2099/)).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabelText("Task schedule mode").click();
    await page.getByRole("option", { name: "One-time" }).click();
    await page.getByLabelText("Scheduled Date").fill("");
    await page.getByRole("button", { name: "Save Task" }).click();

    expect(updateTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task_1",
        scheduledDate: null,
      }),
    );
    await expect.element(page.getByText(/Scheduled .*2099/)).not.toBeInTheDocument();

    await screen.unmount();
  });

  it("saves a recurring task without showing a status field", async () => {
    const createTaskMock = vi.fn(async ({ title, description, status, recurrence }) => ({
      type: "success" as const,
      changedId: "task_recurring",
      snapshot: {
        revision: "rev-2",
        document: {
          version: 5 as const,
          goals: [],
          tasks: [
            {
              id: "task_recurring",
              title,
              description: description ?? "",
              status: status ?? "working",
              scheduledDate: null,
              recurrence: recurrence ?? null,
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        },
      },
    }));
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 5,
          goals: [],
          tasks: [],
        }),
      }),
      createTask: createTaskMock,
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "New Task" }).click();
    await page.getByLabelText("Title").fill("Back up database");
    await page.getByLabelText("Task schedule mode").click();
    await page.getByRole("option", { name: "Recurring" }).click();
    await expect.element(page.getByLabelText("Task status")).not.toBeInTheDocument();
    await page.getByLabelText("Start Date").fill("2026-03-10");
    await page.getByRole("button", { name: "Create Task" }).click();

    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Back up database",
        status: "working",
        recurrence: expect.objectContaining({
          startDate: "2026-03-10",
        }),
      }),
    );
    await expect.element(page.getByText("Back up database")).toBeVisible();

    await screen.unmount();
  });

  it("opens a standalone calendar task in the tasks board", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 4,
          goals: [],
          tasks: [
            {
              id: "task_1",
              title: "Sweep dead code",
              description: "",
              status: "planning",
              scheduledDate: "2026-03-20",
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Calendar" }).click();
    await page.getByRole("button", { name: "Sweep dead code" }).click();

    await expect.element(page.getByLabelText("Tasks", { exact: true })).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect.element(page.getByTestId("project-calendar-view")).not.toBeInTheDocument();
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();
    await expect.element(page.getByText("No description yet.")).not.toBeInTheDocument();

    await screen.unmount();
  });

  it("toggles a recurring calendar occurrence without leaving the calendar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    const completeTaskOccurrenceMock = vi.fn(async ({ taskId, occurrenceDate }) => ({
      type: "success" as const,
      changedId: taskId,
      snapshot: {
        revision: "rev-2",
        document: {
          version: 5 as const,
          goals: [],
          tasks: [
            {
              id: "task_recurring",
              title: "Backup database",
              description: "",
              status: "working",
              scheduledDate: null,
              recurrence: {
                startDate: "2026-03-10",
                rule: {
                  kind: "weekly" as const,
                  interval: 1,
                  weekdays: ["tuesday"] as const,
                },
                completionDates: [occurrenceDate],
              },
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        },
      },
    }));
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 5,
          goals: [],
          tasks: [
            {
              id: "task_recurring",
              title: "Backup database",
              description: "",
              status: "working",
              scheduledDate: null,
              recurrence: {
                startDate: "2026-03-10",
                rule: {
                  kind: "weekly",
                  interval: 1,
                  weekdays: ["tuesday"],
                },
                completionDates: [],
              },
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
      completeTaskOccurrence: completeTaskOccurrenceMock,
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Calendar" }).click();

    const checkbox = page.getByRole("checkbox", {
      name: "Mark Backup database on 2026-03-10 complete",
    });
    await expect.element(checkbox).toBeVisible();
    await expect.element(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect.element(page.getByTestId("project-calendar-view")).toBeVisible();
    await expect.element(page.getByLabelText("Tasks", { exact: true })).not.toHaveAttribute(
      "data-active",
      "true",
    );
    expect(completeTaskOccurrenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrenceDate: "2026-03-10",
        taskId: "task_recurring",
      }),
    );

    await screen.unmount();
  });

  it("marks a recurring occurrence complete and advances the next due date", async () => {
    const today = new Date();
    const todayIso = getLocalIsoDate(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = getLocalIsoDate(tomorrow);
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 5,
          goals: [],
          tasks: [
            {
              id: "task_recurring",
              title: "Backup database",
              description: "",
              status: "working",
              scheduledDate: null,
              recurrence: {
                startDate: todayIso,
                rule: {
                  kind: "daily",
                  interval: 1,
                },
                completionDates: [],
              },
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect
      .element(
        page.getByRole("button", {
          name: `Mark ${formatScheduledDate(todayIso)} Complete`,
        }),
      )
      .toBeVisible();
    await expect.element(page.getByText("Every day")).toBeVisible();
    await page
      .getByRole("button", {
        name: `Mark ${formatScheduledDate(todayIso)} Complete`,
      })
      .click();
    await expect.element(page.getByText(`Next ${formatScheduledDate(tomorrowIso)}`)).toBeVisible();
    await page.getByRole("button", { name: /Backup database/ }).click();
    await expect.element(page.getByRole("button", { name: "Undo" })).toBeVisible();

    await screen.unmount();
  });

  it("opens a goal calendar task in the goal board", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 4,
          goals: [
            {
              id: "goal_1",
              name: "Launch beta",
              status: "working",
              tasks: [
                {
                  id: "task_goal",
                  title: "Beta rehearsal",
                  description: "",
                  status: "scheduled",
                  scheduledDate: "2026-03-22",
                  subtasks: [],
                  linkedThreadIds: [],
                },
              ],
            },
          ],
          tasks: [],
        }),
      }),
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Calendar" }).click();
    await page.getByRole("button", { name: "Beta rehearsal Launch beta" }).click();

    await expect.element(page.getByRole("button", { name: "Launch beta" })).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect.element(page.getByTestId("project-calendar-view")).not.toBeInTheDocument();
    await expect.element(page.getByText("Beta rehearsal")).toBeVisible();
    await expect.element(page.getByText("No description yet.")).not.toBeInTheDocument();

    await screen.unmount();
  });

  it("orders dated tasks ahead of undated tasks within the same status column", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 4,
          goals: [],
          tasks: [
            {
              id: "task_undated",
              title: "Undated task",
              description: "",
              status: "planning",
              scheduledDate: null,
              subtasks: [],
              linkedThreadIds: [],
            },
            {
              id: "task_later",
              title: "Later task",
              description: "",
              status: "planning",
              scheduledDate: "2099-03-22",
              subtasks: [],
              linkedThreadIds: [],
            },
            {
              id: "task_sooner",
              title: "Sooner task",
              description: "",
              status: "planning",
              scheduledDate: "2099-03-20",
              subtasks: [],
              linkedThreadIds: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await expect.element(page.getByText("Sooner task")).toBeVisible();
    await expect.element(page.getByText("Later task")).toBeVisible();
    await expect.element(page.getByText("Undated task")).toBeVisible();

    const boardText = screen.container.textContent ?? "";
    expect(boardText.indexOf("Sooner task")).toBeLessThan(boardText.indexOf("Later task"));
    expect(boardText.indexOf("Later task")).toBeLessThan(boardText.indexOf("Undated task"));

    await screen.unmount();
  });

  it("opens the mobile project nav sheet with goal entries", async () => {
    await page.viewport(430, 932);
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [
            {
              name: "Launch beta",
              status: "working",
              tasks: [],
            },
          ],
          tasks: [
            {
              title: "Sweep dead code",
              description: "",
              status: "working",
              subtasks: [],
            },
          ],
        }),
      }),
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect.element(page.getByRole("button", { name: "Calendar" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Tasks" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Launch beta" })).toBeVisible();
    await page.getByRole("button", { name: "Launch beta" }).click();
    await expect.element(page.getByText("Sweep dead code")).not.toBeInTheDocument();

    await screen.unmount();
  });

  it("shows the calendar entry in the home overview layout", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: null,
      }),
    });

    const screen = await mountHomeOverviewLayout();

    await expect.element(page.getByRole("button", { name: "Calendar" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Tasks" })).toBeVisible();

    await screen.unmount();
  });
});
