import React from "react";

import type { ProjectGoalsGroup, ProjectGoalStatus } from "~/projectGoals";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";

const BOARD_COLUMN_MIN_WIDTH_REM = 14;
const BOARD_COLUMN_GAP_REM = 0.75;
const BOARD_HORIZONTAL_PADDING_REM = 1;
const DEFAULT_ROOT_FONT_SIZE_PX = 16;

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
  alwaysShowBoard?: boolean;
  showSummary?: boolean;
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
  alwaysShowBoard = false,
  showSummary = true,
}: TaskKanbanBoardProps<TItem>) {
  const archivedSwitchId = React.useId();
  const hasVisibleTasks = groups.some((group) => group.items.length > 0);
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const [boardWidthPx, setBoardWidthPx] = React.useState<number | null>(null);
  const [rootFontSizePx, setRootFontSizePx] = React.useState(DEFAULT_ROOT_FONT_SIZE_PX);

  React.useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const updateBoardMetrics = () => {
      const nextWidth = board.getBoundingClientRect().width;
      setBoardWidthPx((currentWidth) =>
        currentWidth !== null && Math.abs(currentWidth - nextWidth) < 0.5 ? currentWidth : nextWidth,
      );

      const nextRootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      );
      if (Number.isFinite(nextRootFontSize) && nextRootFontSize > 0) {
        setRootFontSizePx((currentSize) =>
          Math.abs(currentSize - nextRootFontSize) < 0.5 ? currentSize : nextRootFontSize,
        );
      }
    };

    updateBoardMetrics();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateBoardMetrics();
    });
    observer.observe(board);
    return () => {
      observer.disconnect();
    };
  }, []);

  const requiredBoardWidthPx =
    (groups.length * BOARD_COLUMN_MIN_WIDTH_REM +
      Math.max(0, groups.length - 1) * BOARD_COLUMN_GAP_REM +
      BOARD_HORIZONTAL_PADDING_REM * 2) *
    rootFontSizePx;
  const layoutMode = boardWidthPx !== null && boardWidthPx < requiredBoardWidthPx ? "stacked" : "columns";

  const renderGroup = (group: ProjectGoalsGroup<TItem>) => (
    <section
      key={group.status}
      aria-label={`${group.label} tasks`}
      className={`flex flex-col rounded-2xl border border-border bg-card/80 shadow-sm ${
        layoutMode === "columns" ? "min-h-[22rem]" : ""
      }`}
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
  );

  return (
    <div className="space-y-4 pb-2">
      {showSummary || hasArchivedTasks ? (
        <div className={`flex items-center gap-3 ${showSummary ? "justify-between" : "justify-end"}`}>
          {showSummary ? (
            <div>
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            {hasArchivedTasks ? (
              <div className="flex items-center gap-2">
                <Label
                  className="text-sm font-normal text-muted-foreground"
                  htmlFor={archivedSwitchId}
                >
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
            {showSummary ? <Badge variant="outline">{count}</Badge> : null}
          </div>
        </div>
      ) : null}

      {!alwaysShowBoard && !hasAnyTasks ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-sm">
          <p className="font-medium text-foreground">{emptyState.title}</p>
          <p className="mt-1 text-muted-foreground">{emptyState.description}</p>
          <Button className="mt-4" size="sm" variant="outline" onClick={emptyState.onAction}>
            {emptyState.actionLabel}
          </Button>
        </div>
      ) : !alwaysShowBoard && !hasVisibleTasks ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-sm">
          <p className="font-medium text-foreground">{filteredEmptyState.title}</p>
          <p className="mt-1 text-muted-foreground">{filteredEmptyState.description}</p>
        </div>
      ) : (
        <div
          ref={boardRef}
          className="rounded-2xl border border-border bg-background/55"
          data-layout={layoutMode}
          data-testid="task-kanban-board"
        >
          {layoutMode === "columns" ? (
            <ScrollArea className="w-full" scrollFade scrollbarGutter>
              <div
                className="grid min-w-full grid-flow-col gap-3 p-4"
                style={{
                  gridAutoColumns: `minmax(${BOARD_COLUMN_MIN_WIDTH_REM}rem,1fr)`,
                }}
              >
                {groups.map(renderGroup)}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              {groups.map(renderGroup)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
