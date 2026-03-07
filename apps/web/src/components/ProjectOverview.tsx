import type { ProjectId } from "@t3tools/contracts";

import ProjectOverviewContent from "./project-overview/ProjectOverviewContent";

export default function ProjectOverview({ projectId }: { projectId: ProjectId }) {
  return <ProjectOverviewContent projectId={projectId} />;
}
