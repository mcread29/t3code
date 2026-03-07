import type { ProjectId } from "@t3tools/contracts";

import { useStore } from "../store";

export default function ProjectOverview({ projectId }: { projectId: ProjectId }) {
  const project = useStore((store) => store.projects.find((entry) => entry.id === projectId) ?? null);

  if (!project) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card/80 p-6 text-left shadow-sm">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Temporary Page
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {project.name}
        </h1>
        <p className="mt-2 break-all text-sm text-muted-foreground">{project.cwd}</p>
        <p className="mt-6 text-sm text-muted-foreground">
          This project route is intentionally minimal for now to keep the fork footprint small.
        </p>
      </div>
    </div>
  );
}
