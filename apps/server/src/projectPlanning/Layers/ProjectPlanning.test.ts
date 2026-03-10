import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId } from "@t3tools/contracts";
import { it, assert } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery";
import { ProjectPlanning } from "../Services/ProjectPlanning";
import { ProjectPlanningLive } from "./ProjectPlanning";

const PROJECT_ID = ProjectId.makeUnsafe("project-planning-test");
const NOW = "2026-03-10T12:00:00.000Z";

function makeLayer(workspaceRoot: string) {
  const projectionLayer = Layer.succeed(ProjectionSnapshotQuery, {
    getSnapshot: () =>
      Effect.succeed({
        snapshotSequence: 0,
        projects: [
          {
            id: PROJECT_ID,
            title: "Project Planning Test",
            workspaceRoot,
            defaultModel: null,
            scripts: [],
            createdAt: NOW,
            updatedAt: NOW,
            deletedAt: null,
          },
        ],
        threads: [],
        updatedAt: NOW,
      }),
  });

  return ProjectPlanningLive.pipe(
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(projectionLayer),
  );
}

it.effect("creates recurring tasks and completes or uncompletes occurrences", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "t3-project-planning-"));

  return Effect.gen(function* () {
    const projectPlanning = yield* ProjectPlanning;

    const created = yield* projectPlanning.createTask({
      projectId: PROJECT_ID,
      workspaceRoot,
      title: "Backup database",
      recurrence: {
        startDate: "2026-03-10",
        rule: {
          kind: "weekly",
          interval: 1,
          weekdays: ["tuesday"],
        },
        completionDates: [],
      },
    });

    assert.equal(created.type, "success");
    if (created.type !== "success") {
      return;
    }

    const completed = yield* projectPlanning.completeTaskOccurrence({
      projectId: PROJECT_ID,
      workspaceRoot,
      expectedRevision: created.snapshot.revision,
      taskId: created.changedId,
      occurrenceDate: "2026-03-10",
    });
    assert.equal(completed.type, "success");
    if (completed.type !== "success") {
      return;
    }
    assert.deepEqual(
      completed.snapshot.document.tasks[0]?.recurrence?.completionDates,
      ["2026-03-10"],
    );

    const uncompleted = yield* projectPlanning.uncompleteTaskOccurrence({
      projectId: PROJECT_ID,
      workspaceRoot,
      expectedRevision: completed.snapshot.revision,
      taskId: created.changedId,
      occurrenceDate: "2026-03-10",
    });
    assert.equal(uncompleted.type, "success");
    if (uncompleted.type !== "success") {
      return;
    }
    assert.deepEqual(
      uncompleted.snapshot.document.tasks[0]?.recurrence?.completionDates,
      [],
    );
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
      }),
    ),
    Effect.provide(makeLayer(workspaceRoot)),
  );
});

it.effect("rejects invalid recurring occurrence dates", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "t3-project-planning-invalid-"));

  return Effect.gen(function* () {
    const projectPlanning = yield* ProjectPlanning;

    const created = yield* projectPlanning.createTask({
      projectId: PROJECT_ID,
      workspaceRoot,
      title: "Pay rent",
      recurrence: {
        startDate: "2026-03-01",
        rule: {
          kind: "monthly-day",
          interval: 1,
          dayOfMonth: 1,
        },
        completionDates: [],
      },
    });
    assert.equal(created.type, "success");
    if (created.type !== "success") {
      return;
    }

    const result = yield* projectPlanning.completeTaskOccurrence({
      projectId: PROJECT_ID,
      workspaceRoot,
      expectedRevision: created.snapshot.revision,
      taskId: created.changedId,
      occurrenceDate: "2026-03-02",
    });

    assert.equal(result.type, "error");
    if (result.type === "error") {
      assert.equal(result.code, "invalid_document");
    }
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
      }),
    ),
    Effect.provide(makeLayer(workspaceRoot)),
  );
});
