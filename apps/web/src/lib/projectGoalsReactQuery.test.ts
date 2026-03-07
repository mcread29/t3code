import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NativeApi } from "@t3tools/contracts";

import * as nativeApi from "../nativeApi";
import { ProjectGoalsDocumentParseError } from "../projectGoals";
import {
  projectGoalsDocumentQueryOptions,
  projectGoalsWriteMutationOptions,
} from "./projectGoalsReactQuery";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("projectGoalsReactQuery", () => {
  it("treats a missing file as the default empty document", async () => {
    vi.spyOn(nativeApi, "ensureNativeApi").mockReturnValue({
      projects: {
        readFile: vi.fn().mockResolvedValue({
          relativePath: ".t3code/project-goals.json",
          contents: null,
        }),
      },
    } as unknown as NativeApi);

    const queryClient = new QueryClient();
    const result = await queryClient.fetchQuery(projectGoalsDocumentQueryOptions("/repo/project"));

    expect(result).toEqual({
      version: 1,
      goals: [],
      tasks: [],
    });
  });

  it("throws a typed parse error for invalid JSON", async () => {
    vi.spyOn(nativeApi, "ensureNativeApi").mockReturnValue({
      projects: {
        readFile: vi.fn().mockResolvedValue({
          relativePath: ".t3code/project-goals.json",
          contents: "{ invalid json",
        }),
      },
    } as unknown as NativeApi);

    const queryClient = new QueryClient();

    await expect(
      queryClient.fetchQuery(projectGoalsDocumentQueryOptions("/repo/project")),
    ).rejects.toBeInstanceOf(ProjectGoalsDocumentParseError);
  });

  it("writes the expected JSON file", async () => {
    const writeFile = vi.fn().mockResolvedValue({
      relativePath: ".t3code/project-goals.json",
    });
    vi.spyOn(nativeApi, "ensureNativeApi").mockReturnValue({
      projects: {
        writeFile,
      },
    } as unknown as NativeApi);

    const queryClient = new QueryClient();
    const mutation = projectGoalsWriteMutationOptions({
      cwd: "/repo/project",
      queryClient,
    });

    if (!mutation.mutationFn) {
      throw new Error("Expected write mutation function");
    }

    await mutation.mutationFn(
      {
        version: 1,
        goals: [{ name: "Goal", status: "planning", tasks: [] }],
        tasks: [],
      },
      {} as never,
    );

    expect(writeFile).toHaveBeenCalledWith({
      cwd: "/repo/project",
      relativePath: ".t3code/project-goals.json",
      contents: `{
  "version": 1,
  "goals": [
    {
      "name": "Goal",
      "status": "planning",
      "tasks": []
    }
  ],
  "tasks": []
}
`,
    });
  });
});
