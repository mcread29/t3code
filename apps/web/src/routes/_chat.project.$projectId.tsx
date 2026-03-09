import { ProjectId } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import ProjectOverview from "../components/ProjectOverview";
import { useStore } from "../store";

function ProjectOverviewRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const navigate = useNavigate();
  const projectId = Route.useParams({
    select: (params) => ProjectId.makeUnsafe(params.projectId),
  });
  const projectExists = useStore((store) => store.projects.some((project) => project.id === projectId));
  const search = Route.useSearch();

  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    if (!projectExists) {
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, projectExists, threadsHydrated]);

  if (!threadsHydrated || !projectExists) {
    return null;
  }

  return <ProjectOverview key={`${projectId}:${search.goalId ?? ""}:${search.taskId ?? ""}`} projectId={projectId} />;
}

export const Route = createFileRoute("/_chat/project/$projectId")({
  validateSearch: (search) => ({
    goalId: typeof search.goalId === "string" && search.goalId.trim().length > 0 ? search.goalId : undefined,
    taskId: typeof search.taskId === "string" && search.taskId.trim().length > 0 ? search.taskId : undefined,
  }),
  component: ProjectOverviewRouteView,
});
