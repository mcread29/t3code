import type { ProjectId } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { PanelLeftIcon, PlusIcon } from "lucide-react";
import React from "react";

import { Button } from "../ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from "../ui/sheet";
import { onProjectPlanningUpdated } from "~/wsNativeApi";
import { projectPlanningQueryKeys, projectPlanningSnapshotQueryOptions } from "~/lib/projectGoalsReactQuery";
import { useStore } from "~/store";
import ProjectOverviewContent from "./ProjectOverviewContent";
import ProjectOverviewSidebar from "./ProjectOverviewSidebar";

export type ProjectOverviewSection =
  | { kind: "standalone-tasks" }
  | { kind: "goal"; goalId: string };

export default function ProjectOverviewLayout({ projectId }: { projectId: ProjectId }) {
  const project = useStore((store) => store.projects.find((entry) => entry.id === projectId) ?? null);
  const projectGoalsQuery = useQuery(
    projectPlanningSnapshotQueryOptions({
      projectId,
      cwd: project?.cwd ?? null,
    }),
  );
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = React.useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [goalEditorOpen, setGoalEditorOpen] = React.useState(false);
  const [taskEditorOpen, setTaskEditorOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<ProjectOverviewSection>({
    kind: "standalone-tasks",
  });
  const search = useSearch({
    from: "/_chat/project/$projectId",
  });

  const goals = projectGoalsQuery.data?.document.goals;
  const queryClient = useQueryClient();

  const selectStandaloneTasks = React.useCallback(() => {
    setActiveSection({ kind: "standalone-tasks" });
    setMobileSidebarOpen(false);
  }, []);
  const selectGoal = React.useCallback((goalId: string) => {
    setActiveSection({ kind: "goal", goalId });
    setMobileSidebarOpen(false);
  }, []);

  React.useEffect(() => {
    if (search.goalId) {
      setActiveSection({ kind: "goal", goalId: search.goalId });
      return;
    }
    if (search.taskId) {
      const goalForTask = goals?.find((goal) => goal.tasks.some((task) => task.id === search.taskId));
      if (goalForTask) {
        setActiveSection({ kind: "goal", goalId: goalForTask.id });
        return;
      }
      setActiveSection({ kind: "standalone-tasks" });
    }
  }, [goals, search.goalId, search.taskId]);

  React.useEffect(() => {
    if (activeSection.kind !== "goal") {
      return;
    }

    const goalIds = goals?.map((goal) => goal.id) ?? [];
    if (goalIds.length === 0) {
      setActiveSection({ kind: "standalone-tasks" });
      return;
    }

    if (!goalIds.includes(activeSection.goalId)) {
      setActiveSection({ kind: "standalone-tasks" });
    }
  }, [activeSection, goals]);

  React.useEffect(() => {
    if (!project?.cwd) {
      return;
    }

    return onProjectPlanningUpdated((event) => {
      if (event.projectId !== projectId && event.workspaceRoot !== project.cwd) {
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: projectPlanningQueryKeys.snapshot(projectId, project.cwd),
      });
    });
  }, [project?.cwd, projectId, queryClient]);

  let content: React.ReactNode;
  switch (activeSection.kind) {
    case "standalone-tasks":
    case "goal":
      content = (
        <ProjectOverviewContent
          activeSection={activeSection}
          goalEditorOpen={goalEditorOpen}
          {...(search.taskId ? { highlightedTaskId: search.taskId } : {})}
          onGoalEditorOpenChange={setGoalEditorOpen}
          onTaskEditorOpenChange={setTaskEditorOpen}
          projectId={projectId}
          taskEditorOpen={taskEditorOpen}
        />
      );
      break;
    default: {
      const exhaustiveSection: never = activeSection;
      content = exhaustiveSection;
    }
  }

  if (!project) {
    return null;
  }

  return (
    <div className="flex h-dvh min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetPopup
          className="w-[min(20rem,calc(100vw-var(--spacing(3))))] max-w-[20rem] bg-sidebar p-0 text-sidebar-foreground"
          showCloseButton={false}
          side="left"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Project navigation</SheetTitle>
            <SheetDescription>Navigate project sections.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">
            <ProjectOverviewSidebar
              activeSection={activeSection}
              goals={goals ?? []}
              onSelectGoal={selectGoal}
              onSelectStandaloneTasks={selectStandaloneTasks}
              orientation="vertical"
            />
          </div>
        </SheetPopup>
      </Sheet>

      <header className="border-b border-border px-3 py-2 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
            <Button
              aria-label="Toggle Sidebar"
              className="size-7 shrink-0"
              onClick={() => {
                if (window.matchMedia("(max-width: 767px)").matches) {
                  setMobileSidebarOpen((open) => !open);
                  return;
                }
                setDesktopSidebarExpanded((expanded) => !expanded);
              }}
              size="icon"
              variant="ghost"
            >
              <PanelLeftIcon />
            </Button>
            <h1
              className="min-w-0 shrink truncate text-sm font-medium text-foreground"
              title={project.name}
            >
              {project.name}
            </h1>
            <p
              className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
              title={project.cwd}
            >
              {project.cwd}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => setGoalEditorOpen(true)}>
              <PlusIcon />
              New Goal
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTaskEditorOpen(true)}>
              <PlusIcon />
              New Task
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 min-w-0">
          <aside
            className={`hidden shrink-0 border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear md:block ${
              desktopSidebarExpanded ? "w-64" : "w-12"
            }`}
          >
            <ProjectOverviewSidebar
              activeSection={activeSection}
              collapsed={!desktopSidebarExpanded}
              goals={goals ?? []}
              onSelectGoal={selectGoal}
              onSelectStandaloneTasks={selectStandaloneTasks}
              orientation="vertical"
            />
          </aside>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
