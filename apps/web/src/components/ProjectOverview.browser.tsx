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
import { useStore } from "../store";
import ProjectOverview from "./ProjectOverview";

const PROJECT_ID = "project-overview-test" as ProjectId;
const PROJECT_CWD = "/repo/project-overview";

let currentNativeApi: NativeApi;

vi.mock("~/nativeApi", () => ({
  ensureNativeApi: () => currentNativeApi,
}));

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
  }) => Promise<unknown>;
  updateTask?: (input: {
    taskId: string;
    title?: string;
    description?: string;
    status?: string;
    scheduledDate?: string | null;
  }) => Promise<unknown>;
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
    vi.fn(async ({ goalId, title, description, status, scheduledDate }) => {
      const nextTask = createTask({
        title,
        description: description ?? "",
        status: status ?? "planning",
        scheduledDate: scheduledDate ?? null,
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
    vi.fn(async ({ taskId, title, description, status, scheduledDate }) => {
      document =
        updateTask(await ensureDocument(), taskId, (task) => ({
          ...task,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(scheduledDate !== undefined ? { scheduledDate } : {}),
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
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectOverview projectId={PROJECT_ID} />
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

    await expect.element(page.getByRole("button", { name: "Tasks" })).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect.element(page.getByRole("button", { name: "Launch beta" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Stabilize editor" })).toBeVisible();
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();

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

    await expect.element(page.getByRole("button", { name: "Tasks" })).toBeVisible();
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "columns");
    await sidebarToggle.click();
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();
    await expect.element(taskBoard()).toBeVisible();
    await sidebarToggle.click();
    await expect.element(page.getByRole("button", { name: "Tasks" })).toBeVisible();
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
    await expect.element(page.getByLabelText("Scheduled Date")).toBeVisible();

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
          version: 4 as const,
          goals: [],
          tasks: [
            {
              id: "task_1",
              title: "Task",
              description: "",
              status: "planning",
              scheduledDate,
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
    await expect.element(page.getByRole("button", { name: "Tasks" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Launch beta" })).toBeVisible();
    await page.getByRole("button", { name: "Launch beta" }).click();
    await expect.element(page.getByText("Sweep dead code")).not.toBeInTheDocument();

    await screen.unmount();
  });
});
