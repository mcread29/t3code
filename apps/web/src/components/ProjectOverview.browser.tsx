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
  it("shows the empty state when the planning file is missing", async () => {
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: null,
      }),
    });

    const screen = await mountOverview();

    await expect.element(page.getByText("No goals or tasks yet")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Create first goal" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Create standalone task" })).toBeVisible();

    await screen.unmount();
  });

  it("defaults to the tasks tab and switches between task and goal kanban boards", async () => {
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

    await expect.element(page.getByRole("tab", { name: /Tasks 1/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();
    await expect.element(page.getByLabelText("Done tasks")).toBeVisible();

    await page.getByRole("tab", { name: /Goals 1/i }).click();
    await expect.element(page.getByRole("tab", { name: /Goals 1/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.element(page.getByLabelText("Selected goal")).toBeVisible();
    await expect.element(page.getByText("Launch beta")).toBeVisible();
    await expect.element(page.getByText("Goal Tasks")).toBeVisible();
    await expect.element(page.getByText("Polish onboarding")).toBeVisible();
    await expect.element(page.getByLabelText("Scheduled tasks")).toBeVisible();
    await expect.element(page.getByText("High-level project outcomes with nested tasks.")).toBeVisible();

    await page.getByRole("tab", { name: /Tasks 1/i }).click();
    await expect.element(page.getByRole("tab", { name: /Tasks 1/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.element(page.getByText("Tasks that are not attached to a goal.")).toBeVisible();

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

    await expect.element(page.getByRole("tab", { name: /Tasks 0/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.element(page.getByText("No visible standalone tasks")).toBeVisible();
    await expect.element(page.getByRole("switch", { name: "Show archived" })).toBeVisible();

    await page.getByRole("switch", { name: "Show archived" }).click();

    await expect.element(page.getByRole("tab", { name: /Tasks 1/i })).toBeVisible();
    await expect.element(page.getByText("Archive cleanup")).toBeVisible();
    await expect.element(page.getByLabelText("Archived tasks")).toBeVisible();

    await page.getByRole("tab", { name: /Goals 1/i }).click();
    await expect.element(page.getByText("No visible tasks for this goal")).toBeVisible();
    await expect.element(page.getByRole("switch", { name: "Show archived" })).toBeVisible();

    await page.getByRole("switch", { name: "Show archived" }).click();

    await expect.element(page.getByText("Archive docs")).toBeVisible();

    await screen.unmount();
  });

  it("removes a task from the visible board when its status changes to archived", async () => {
    const writeFile = vi.fn().mockResolvedValue({
      relativePath: ".t3code/project-goals.json",
    });
    currentNativeApi = buildNativeApi({
      readFile: vi.fn().mockResolvedValue({
        relativePath: ".t3code/project-goals.json",
        contents: JSON.stringify({
          version: 1,
          goals: [],
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
      writeFile,
    });

    const screen = await mountOverview();

    await expect.element(page.getByRole("tab", { name: /Tasks 1/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.element(page.getByText("Sweep dead code")).toBeVisible();

    await page.getByLabelText("Status for Sweep dead code").click();
    await page.getByRole("option", { name: "Archived" }).click();

    await expect.element(page.getByRole("tab", { name: /Tasks 0/i })).toBeVisible();
    await expect.element(page.getByText("No visible standalone tasks")).toBeVisible();
    expect(writeFile).toHaveBeenCalledWith({
      cwd: PROJECT_CWD,
      relativePath: ".t3code/project-goals.json",
      contents: expect.stringContaining('"status": "archived"'),
    });

    await screen.unmount();
  });

  it("opens the standalone task dialog from the header while the goals tab is selected", async () => {
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

    await page.getByRole("tab", { name: /Goals 1/i }).click();
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

    await page.getByRole("button", { name: "Create first goal" }).click();
    await page.getByLabelText("Name").fill("Ship v1");
    await expect.element(page.getByRole("button", { name: "Create Goal" })).toBeVisible();
    await page.getByRole("button", { name: "Create Goal" }).click();

    await expect.element(page.getByText("Ship v1")).toBeVisible();
    expect(writeFile).toHaveBeenCalledWith({
      cwd: PROJECT_CWD,
      relativePath: ".t3code/project-goals.json",
      contents: expect.stringContaining('"name": "Ship v1"'),
    });

    await screen.unmount();
  });
});
