import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NativeApi } from "@t3tools/contracts";

import * as nativeApi from "../nativeApi";
import { ProjectGoalsDocumentParseError } from "../projectGoals";
import {
  ProjectPlanningRpcError,
  projectPlanningSnapshotQueryOptions,
  unwrapMutationResult,
} from "./projectGoalsReactQuery";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("projectGoalsReactQuery", () => {
  it("treats a missing file as the default empty document", async () => {
    vi.spyOn(nativeApi, "ensureNativeApi").mockReturnValue({
      projectPlanning: {
        getSnapshot: vi.fn().mockResolvedValue({
          type: "success",
          snapshot: {
            revision: "rev-1",
            document: {
              version: 4,
              goals: [],
              tasks: [
                {
                  id: "task-1",
                  title: "Task",
                  description: "",
                  status: "planning",
                  scheduledDate: "2026-03-20",
                  subtasks: [],
                  linkedThreadIds: [],
                },
              ],
            },
          },
        }),
      },
    } as unknown as NativeApi);

    const queryClient = new QueryClient();
    const result = await queryClient.fetchQuery(
      projectPlanningSnapshotQueryOptions({
        projectId: "project-1" as never,
        cwd: "/repo/project",
      }),
    );

    expect(result.document).toEqual({
      version: 4,
      goals: [],
      tasks: [
        {
          id: "task-1",
          title: "Task",
          description: "",
          status: "planning",
          scheduledDate: "2026-03-20",
          subtasks: [],
          linkedThreadIds: [],
        },
      ],
    });
  });

  it("throws a typed parse error for invalid documents", async () => {
    vi.spyOn(nativeApi, "ensureNativeApi").mockReturnValue({
      projectPlanning: {
        getSnapshot: vi.fn().mockResolvedValue({
          type: "error",
          code: "invalid_document",
          message: "invalid",
          entityType: "document",
        }),
      },
    } as unknown as NativeApi);

    const queryClient = new QueryClient();

    await expect(
      queryClient.fetchQuery(
        projectPlanningSnapshotQueryOptions({
          projectId: "project-1" as never,
          cwd: "/repo/project",
        }),
      ),
    ).rejects.toBeInstanceOf(ProjectGoalsDocumentParseError);
  });

  it("throws a typed RPC error for mutation conflicts", () => {
    expect(() =>
      unwrapMutationResult({
        type: "error",
        code: "conflict",
        message: "stale revision",
        entityType: "document",
        expectedRevision: "rev-1",
        actualRevision: "rev-2",
      }),
    ).toThrow(ProjectPlanningRpcError);
  });
});
