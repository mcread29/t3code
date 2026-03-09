import http from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Effect, FileSystem, Layer, Path } from "effect";
import * as z from "zod/v4";

import { ServerConfig } from "../../config";
import { ProjectPlanningMcpServer } from "../Services/ProjectPlanningMcpServer";
import { ProjectPlanning } from "../Services/ProjectPlanning";

let managedCodexHomePath: string | undefined;
let managedProjectPlanningMcpUrl: string | undefined;

export function readManagedCodexHomePath(): string | undefined {
  return managedCodexHomePath;
}

export function readManagedProjectPlanningMcpUrl(): string | undefined {
  return managedProjectPlanningMcpUrl;
}

const toolDescription = (entity: string) =>
  `Manage project planning ${entity}. Prefer this tool over editing .t3code/project-goals.json directly.`;

function formatToolText(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

async function readRequestBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export const ProjectPlanningMcpServerLive = Layer.effect(
  ProjectPlanningMcpServer,
  Effect.acquireRelease(
    Effect.gen(function* () {
      const projectPlanning = yield* ProjectPlanning;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { stateDir } = yield* ServerConfig;

      const mcpServer = http.createServer((req, res) => {
        void (async () => {
          if ((req.url ?? "") !== "/mcp") {
            res.writeHead(404).end();
            return;
          }

          if (req.method !== "POST") {
            res.writeHead(405, { Allow: "POST" });
            res.end("Method Not Allowed");
            return;
          }

          try {
            const body = await readRequestBody(req);
            const server = new McpServer(
              {
                name: "t3-project-planning",
                version: "1.0.0",
              },
              { capabilities: { tools: {} } },
            );

            server.registerTool(
              "project_planning_get_snapshot",
              {
                description: toolDescription("state"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.getSnapshot(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_create_goal",
              {
                description: toolDescription("goals"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  name: z.string(),
                  status: z
                    .enum(["working", "scheduled", "planning", "done", "archived"])
                    .optional(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.createGoal(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_update_goal",
              {
                description: toolDescription("goals"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  goalId: z.string(),
                  name: z.string().optional(),
                  status: z
                    .enum(["working", "scheduled", "planning", "done", "archived"])
                    .optional(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.updateGoal(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_delete_goal",
              {
                description: toolDescription("goals"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  goalId: z.string(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.deleteGoal(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_create_task",
              {
                description: toolDescription("tasks"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  goalId: z.string().optional(),
                  title: z.string(),
                  description: z.string().optional(),
                  status: z
                    .enum(["working", "scheduled", "planning", "done", "archived"])
                    .optional(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.createTask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_update_task",
              {
                description: toolDescription("tasks"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  taskId: z.string(),
                  title: z.string().optional(),
                  description: z.string().optional(),
                  status: z
                    .enum(["working", "scheduled", "planning", "done", "archived"])
                    .optional(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.updateTask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_delete_task",
              {
                description: toolDescription("tasks"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  taskId: z.string(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.deleteTask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_attach_thread_to_task",
              {
                description: toolDescription("task-thread links"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  taskId: z.string(),
                  threadId: z.string(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.attachThreadToTask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_detach_thread_from_task",
              {
                description: toolDescription("task-thread links"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  taskId: z.string(),
                  threadId: z.string(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.detachThreadFromTask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_create_subtask",
              {
                description: toolDescription("subtasks"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  taskId: z.string(),
                  task: z.string(),
                  done: z.boolean().optional(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.createSubtask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_update_subtask",
              {
                description: toolDescription("subtasks"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  subtaskId: z.string(),
                  task: z.string().optional(),
                  done: z.boolean().optional(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.updateSubtask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            server.registerTool(
              "project_planning_delete_subtask",
              {
                description: toolDescription("subtasks"),
                inputSchema: {
                  projectId: z.string().optional(),
                  workspaceRoot: z.string().optional(),
                  expectedRevision: z.string().optional(),
                  subtaskId: z.string(),
                },
              },
              async (input) => {
                const result = await Effect.runPromise(projectPlanning.deleteSubtask(input));
                return {
                  content: [{ type: "text", text: formatToolText(result) }],
                  structuredContent: result,
                  isError: result.type === "error",
                };
              },
            );

            const transport = new StreamableHTTPServerTransport({});
            await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
            await transport.handleRequest(req, res, body);
            res.on("close", () => {
              void transport.close();
              void server.close();
            });
          } catch (error) {
            if (!res.headersSent) {
              res.writeHead(500, { "content-type": "application/json" });
              res.end(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : "Internal server error",
                  },
                  id: null,
                }),
              );
            }
          }
        })();
      });

      yield* Effect.promise<void>(
        () =>
          new Promise((resolve, reject) => {
            mcpServer.listen(0, "127.0.0.1", () => resolve());
            mcpServer.once("error", reject);
          }),
      );

      const address = mcpServer.address();
      if (!address || typeof address === "string") {
        throw new Error("Project planning MCP server did not expose a TCP address.");
      }

      const configDir = path.join(stateDir, "codex-managed", "project-planning");
      const homePath = path.join(configDir, "home");
      const configTomlPath = path.join(homePath, "config.toml");
      const url = `http://127.0.0.1:${address.port}/mcp`;

      yield* fileSystem.makeDirectory(path.dirname(configTomlPath), { recursive: true });
      yield* fileSystem.writeFileString(
        configTomlPath,
        `[mcp_servers.project_planning]\nurl = "${url}"\n`,
      );
      managedCodexHomePath = homePath;
      managedProjectPlanningMcpUrl = url;

      return {
        url,
        configTomlPath,
        homePath,
        server: mcpServer,
      };
    }),
    ({ server }) =>
      Effect.promise<void>(
        () =>
          new Promise((resolve) => {
            managedCodexHomePath = undefined;
            managedProjectPlanningMcpUrl = undefined;
            server.close(() => resolve());
          }),
      ),
  ).pipe(Effect.map(({ url }) => ({ url }))),
);
