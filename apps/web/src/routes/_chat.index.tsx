import { createFileRoute } from "@tanstack/react-router";

import RootPlanningOverview from "../components/RootPlanningOverview";

function ChatIndexRouteView() {
  return <RootPlanningOverview />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
