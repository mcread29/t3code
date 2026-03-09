import "../index.css";

import type { NativeApi, ProjectId } from "@t3tools/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useStore } from "../store";
import ProjectOverview from "./ProjectOverview";

const PROJECT_ID = "project-overview-test" as ProjectId;
const PROJECT_CWD = "/repo/project-overview";

let currentNativeApi: NativeApi;

vi.mock("~/nativeApi", () => ({
  ensureNativeApi: () => currentNativeApi,
}));

function buildNativeApi(input: {
  readFile: ReturnType<typeof vi.fn>;
  writeFile?: ReturnType<typeof vi.fn>;
  confirm?: ReturnType<typeof vi.fn>;
}): NativeApi {
  return {
    projects: {
      readFile: input.readFile,
      writeFile: input.writeFile ?? vi.fn().mockResolvedValue({ relativePath: ".t3code/project-goals.json" }),
    },
    dialogs: {
      confirm: input.confirm ?? vi.fn().mockResolvedValue(true),
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

  it("renders standalone tasks and all goals in the project nav", async () => {
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

    await expect.element(page.getByRole("button", { name: "Standalone Tasks" })).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect.element(page.getByRole("button", { name: "Launch beta" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Stabilize editor" })).toBeVisible();
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();

    await screen.unmount();
  });

  it("switches from standalone tasks to a selected goal without tabs", async () => {
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

    await expect.element(page.getByRole("button", { name: "Standalone Tasks" })).toBeVisible();
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "columns");
    await sidebarToggle.click();
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();
    await expect.element(taskBoard()).toBeVisible();
    await sidebarToggle.click();
    await expect.element(page.getByRole("button", { name: "Standalone Tasks" })).toBeVisible();
    await expect.element(taskBoard()).toHaveAttribute("data-layout", "columns");

    await screen.unmount();
  });

  it("hides archived standalone tasks by default and reveals them with the board toggle", async () => {
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

  it("stacks standalone task categories vertically when the board is too narrow", async () => {
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

  it("opens the standalone task dialog from the header even when only goals exist", async () => {
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

    await screen.unmount();
  });

  it("creates the first goal and writes the workspace planning file", async () => {
    const writeFile = vi.fn().mockResolvedValue({
      relativePath: ".t3code/project-goals.json",
    });
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: null,
      }),
      writeFile,
    });

    const screen = await mountOverview();

    await page.getByRole("button", { name: "New Goal" }).click();
    await page.getByLabelText("Name").fill("Ship v1");
    await page.getByRole("button", { name: "Create Goal" }).click();

    expect(writeFile).toHaveBeenCalledWith({
      cwd: PROJECT_CWD,
      relativePath: ".t3code/project-goals.json",
      contents: expect.stringContaining('"name": "Ship v1"'),
    });

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
    await expect.element(page.getByRole("button", { name: "Standalone Tasks" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Launch beta" })).toBeVisible();
    await page.getByRole("button", { name: "Launch beta" }).click();
    await expect.element(page.getByText("Sweep dead code")).not.toBeInTheDocument();

    await screen.unmount();
  });
});
