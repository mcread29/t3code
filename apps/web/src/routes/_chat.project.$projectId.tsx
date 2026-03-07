import { ProjectId } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import ProjectOverview from "../components/ProjectOverview";
import { useStore } from "../store";
import { SidebarInset } from "~/components/ui/sidebar";

function ProjectOverviewRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const navigate = useNavigate();
  const projectId = Route.useParams({
    select: (params) => ProjectId.makeUnsafe(params.projectId),
  });
  const projectExists = useStore((store) => store.projects.some((project) => project.id === projectId));

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

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <ProjectOverview key={projectId} projectId={projectId} />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/project/$projectId")({
  component: ProjectOverviewRouteView,
});
