import type {
  ProjectId,
  ProjectPlanningErrorCode,
  ProjectPlanningMutationResult,
  ProjectPlanningSnapshot,
  ProjectPlanningSnapshotResult,
} from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";

import { ensureNativeApi } from "../nativeApi";
import { ProjectGoalsDocumentParseError, type ProjectGoalsDocument } from "../projectGoals";

export class ProjectPlanningRpcError extends Error {
  override readonly name = "ProjectPlanningRpcError";

  constructor(
    readonly code: ProjectPlanningErrorCode,
    message: string,
    readonly details: ProjectPlanningSnapshotResult | ProjectPlanningMutationResult,
  ) {
    super(message);
  }
}

function unwrapSnapshotResult(result: ProjectPlanningSnapshotResult): ProjectPlanningSnapshot {
  if (result.type === "success") {
    return result.snapshot;
  }

  if (result.code === "invalid_document") {
    throw new ProjectGoalsDocumentParseError(result.message, "invalid-schema");
  }

  throw new ProjectPlanningRpcError(result.code, result.message, result);
}

export function unwrapMutationResult(result: ProjectPlanningMutationResult): {
  changedId: string;
  snapshot: ProjectPlanningSnapshot;
} {
  if (result.type === "success") {
    return result;
  }

  throw new ProjectPlanningRpcError(result.code, result.message, result);
}

export const projectPlanningQueryKeys = {
  all: ["project-planning"] as const,
  snapshot: (projectId: ProjectId | null, cwd: string | null) =>
    ["project-planning", "snapshot", projectId ?? null, cwd ?? null] as const,
};

export function projectPlanningSnapshotQueryOptions(input: {
  projectId: ProjectId | null;
  cwd: string | null;
}) {
  return queryOptions({
    queryKey: projectPlanningQueryKeys.snapshot(input.projectId, input.cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.projectId && !input.cwd) {
        throw new Error("Project goals are unavailable.");
      }

      const result = await api.projectPlanning.getSnapshot({
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.cwd ? { workspaceRoot: input.cwd } : {}),
      });
      return unwrapSnapshotResult(result);
    },
    enabled: input.projectId !== null || input.cwd !== null,
  });
}

export function projectGoalsDocumentQueryOptions(
  projectId: ProjectId | null,
  cwd: string | null,
) {
  return queryOptions({
    queryKey: ["project-planning", "document", projectId ?? null, cwd ?? null] as const,
    queryFn: async (): Promise<ProjectGoalsDocument> => {
      const api = ensureNativeApi();
      if (!projectId && !cwd) {
        throw new Error("Project goals are unavailable.");
      }
      const snapshot = unwrapSnapshotResult(
        await api.projectPlanning.getSnapshot({
          ...(projectId ? { projectId } : {}),
          ...(cwd ? { workspaceRoot: cwd } : {}),
        }),
      );
      return snapshot.document;
    },
    enabled: projectId !== null || cwd !== null,
  });
}
