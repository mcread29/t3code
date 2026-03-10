import type { ProjectId } from "@t3tools/contracts";

import ProjectOverviewLayout from "./project-overview/ProjectOverviewLayout";
import { useStore } from "../store";

export default function ProjectOverview({
  projectId,
  search,
}: {
  projectId: ProjectId;
  search?: {
    goalId?: string;
    taskId?: string;
  };
}) {
  const project = useStore((store) => store.projects.find((entry) => entry.id === projectId) ?? null);

  if (!project) {
    return null;
  }

  return (
    <ProjectOverviewLayout
      projectId={project.id}
      subtitle={project.cwd}
      threadProjectId={project.id}
      title={project.name}
      workspaceRoot={project.cwd}
      {...(search?.taskId ? { highlightedTaskId: search.taskId } : {})}
      {...(search ? { search } : {})}
    />
  );
}
