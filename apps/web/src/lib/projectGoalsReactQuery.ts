import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { ensureNativeApi } from "../nativeApi";
import {
  parseProjectGoalsDocument,
  PROJECT_GOALS_FILE_PATH,
  type ProjectGoalsDocument,
  serializeProjectGoalsDocument,
} from "../projectGoals";

export const projectGoalsQueryKeys = {
  all: ["project-goals"] as const,
  document: (cwd: string | null) => ["project-goals", "document", cwd] as const,
};

export const projectGoalsMutationKeys = {
  write: (cwd: string | null) => ["project-goals", "mutation", "write", cwd] as const,
};

export function projectGoalsDocumentQueryOptions(cwd: string | null) {
  return queryOptions({
    queryKey: projectGoalsQueryKeys.document(cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!cwd) {
        throw new Error("Project goals are unavailable.");
      }
      const result = await api.projects.readFile({
        cwd,
        relativePath: PROJECT_GOALS_FILE_PATH,
      });
      return parseProjectGoalsDocument(result.contents);
    },
    enabled: cwd !== null,
  });
}

export function projectGoalsWriteMutationOptions(input: {
  cwd: string | null;
  queryClient: QueryClient;
}) {
  return mutationOptions({
    mutationKey: projectGoalsMutationKeys.write(input.cwd),
    mutationFn: async (document: ProjectGoalsDocument) => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Project goals are unavailable.");
      }
      return api.projects.writeFile({
        cwd: input.cwd,
        relativePath: PROJECT_GOALS_FILE_PATH,
        contents: serializeProjectGoalsDocument(document),
      });
    },
    onSettled: async () => {
      await input.queryClient.invalidateQueries({
        queryKey: projectGoalsQueryKeys.document(input.cwd),
      });
    },
  });
}
