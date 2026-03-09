import type { ProjectId } from "@t3tools/contracts";

import ProjectOverviewLayout from "./project-overview/ProjectOverviewLayout";

export default function ProjectOverview({ projectId }: { projectId: ProjectId }) {
  return <ProjectOverviewLayout projectId={projectId} />;
}
