import React from "react";

import type { ProjectGoalsGroup, ProjectGoalStatus } from "~/projectGoals";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";

interface TaskKanbanBoardProps<TItem> {
  title: string;
  description: string;
  count: number;
  groups: Array<ProjectGoalsGroup<TItem>>;
  hasAnyTasks: boolean;
  hasArchivedTasks: boolean;
  showArchived: boolean;
  onShowArchivedChange: (checked: boolean) => void;
  emptyState: {
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
  };
  filteredEmptyState: {
    title: string;
    description: string;
  };
  renderTask: (item: TItem, status: ProjectGoalStatus) => React.ReactNode;
}

export default function TaskKanbanBoard<TItem>({
  title,
  description,
  count,
  groups,
  hasAnyTasks,
  hasArchivedTasks,
  showArchived,
  onShowArchivedChange,
  emptyState,
  filteredEmptyState,
  renderTask,
}: TaskKanbanBoardProps<TItem>) {
  const archivedSwitchId = React.useId();
  const hasVisibleTasks = groups.some((group) => group.items.length > 0);

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasArchivedTasks ? (
            <div className="flex items-center gap-2">
              <Label className="text-sm font-normal text-muted-foreground" htmlFor={archivedSwitchId}>
                Show archived
              </Label>
              <Switch
                aria-label="Show archived"
                checked={showArchived}
                id={archivedSwitchId}
                onCheckedChange={onShowArchivedChange}
              />
            </div>
          ) : null}
          <Badge variant="outline">{count}</Badge>
        </div>
      </div>

      {!hasAnyTasks ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-sm">
          <p className="font-medium text-foreground">{emptyState.title}</p>
          <p className="mt-1 text-muted-foreground">{emptyState.description}</p>
          <Button className="mt-4" size="sm" variant="outline" onClick={emptyState.onAction}>
            {emptyState.actionLabel}
          </Button>
        </div>
      ) : !hasVisibleTasks ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-sm">
          <p className="font-medium text-foreground">{filteredEmptyState.title}</p>
          <p className="mt-1 text-muted-foreground">{filteredEmptyState.description}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-background/55">
          <ScrollArea className="w-full" scrollFade scrollbarGutter>
            <div className="grid min-w-full grid-flow-col auto-cols-[minmax(14rem,1fr)] gap-3 p-4">
              {groups.map((group) => (
                <section
                  key={group.status}
                  aria-label={`${group.label} tasks`}
                  className="flex min-h-[22rem] flex-col rounded-2xl border border-border bg-card/80 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{group.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.items.length} {group.items.length === 1 ? "task" : "tasks"}
                      </p>
                    </div>
                    <Badge variant="outline">{group.items.length}</Badge>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-3">
                    {group.items.length === 0 ? (
                      <div className="flex min-h-28 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-background/70 px-4 text-center text-sm text-muted-foreground">
                        No tasks
                      </div>
                    ) : (
                      group.items.map((item) => renderTask(item, group.status))
                    )}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
