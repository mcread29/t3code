import { ServiceMap } from "effect";

export interface ProjectPlanningMcpServerShape {
  readonly url: string;
}

export class ProjectPlanningMcpServer extends ServiceMap.Service<
  ProjectPlanningMcpServer,
  ProjectPlanningMcpServerShape
>()("t3/projectPlanning/Services/ProjectPlanningMcpServer") {}
