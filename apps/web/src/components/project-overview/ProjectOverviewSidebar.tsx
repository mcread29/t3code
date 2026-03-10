import { ListTodoIcon, TargetIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { ProjectGoal } from "~/projectGoals";

import type { ProjectOverviewSection } from "./ProjectOverviewLayout";

export default function ProjectOverviewSidebar({
  activeSection,
  collapsed = false,
  goals,
  onSelectGoal,
  onSelectStandaloneTasks,
  orientation,
}: {
  activeSection: ProjectOverviewSection;
  collapsed?: boolean;
  goals: readonly ProjectGoal[];
  onSelectGoal: (goalId: string) => void;
  onSelectStandaloneTasks: () => void;
  orientation: "horizontal" | "vertical";
}) {
  const isHorizontal = orientation === "horizontal";

  const navButtonClassName = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-lg text-sm outline-hidden ring-sidebar-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 active:bg-accent active:text-foreground [&_svg]:shrink-0",
      isHorizontal
        ? "h-9 shrink-0 px-3"
        : collapsed
          ? "size-8 justify-center self-center p-0"
          : "w-full px-2.5 py-2 text-left",
      active ? "bg-accent font-medium text-foreground" : "text-sidebar-foreground",
    );

  return (
    <div
      className={cn(
        isHorizontal
          ? "flex min-w-full items-center gap-2 px-3 py-2 sm:px-5"
          : collapsed
            ? "flex flex-col gap-2 p-2"
            : "flex flex-col gap-2 p-3",
      )}
    >
      <button
        aria-label="Tasks"
        className={navButtonClassName(activeSection.kind === "standalone-tasks")}
        data-active={activeSection.kind === "standalone-tasks"}
        onClick={onSelectStandaloneTasks}
        title="Tasks"
        type="button"
      >
        <ListTodoIcon className="size-4" />
        {!collapsed || isHorizontal ? <span className={cn(isHorizontal ? "max-w-48 truncate" : "truncate")}>Tasks</span> : null}
      </button>

      {goals.map((goal, goalIndex) => {
        const isActive = activeSection.kind === "goal" && activeSection.goalId === goal.id;
        const goalName = goal.name || `Untitled goal ${goalIndex + 1}`;
        return (
          <button
            key={goal.id}
            aria-label={goalName}
            className={navButtonClassName(isActive)}
            data-active={isActive}
            onClick={() => onSelectGoal(goal.id)}
            title={goalName}
            type="button"
          >
            <TargetIcon className="size-4" />
            {!collapsed || isHorizontal ? (
              <span className={cn(isHorizontal ? "max-w-56 truncate" : "truncate")}>{goalName}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
