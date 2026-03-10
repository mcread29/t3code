import ProjectOverviewLayout from "./project-overview/ProjectOverviewLayout";
import { useServerWelcomePayload } from "../hooks/useServerWelcomePayload";
import { useStore } from "../store";

function RootPlanningOverviewLoadingState() {
  return (
    <div className="flex h-dvh min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl rounded-2xl border border-border bg-card/80 p-6 text-sm text-muted-foreground shadow-sm">
          Loading workspace goals...
        </div>
      </div>
    </div>
  );
}

export default function RootPlanningOverview() {
  const welcome = useServerWelcomePayload();
  const projects = useStore((store) => store.projects);

  if (!welcome) {
    return <RootPlanningOverviewLoadingState />;
  }

  const planningRoot = welcome.homeDirectory ?? welcome.cwd;
  const title = planningRoot === welcome.cwd ? welcome.projectName : "Home";

  const matchedProject =
    (welcome.bootstrapProjectId
      ? projects.find((project) => project.id === welcome.bootstrapProjectId) ?? null
      : null) ??
    projects.find((project) => project.cwd === welcome.cwd) ??
    null;

  if (!matchedProject) {
    return <RootPlanningOverviewLoadingState />;
  }

  return (
    <ProjectOverviewLayout
      loadingLabel="Loading home goals..."
      navigationLabel="Home navigation"
      projectId={null}
      showCalendarEntry
      subtitle={planningRoot}
      threadProjectId={matchedProject.id}
      title={title}
      workspaceRoot={planningRoot}
    />
  );
}
