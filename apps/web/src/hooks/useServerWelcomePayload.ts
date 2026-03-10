import { useEffect, useState } from "react";

import type { WsWelcomePayload } from "@t3tools/contracts";

import { onServerWelcome } from "../wsNativeApi";

export function useServerWelcomePayload(): WsWelcomePayload | null {
  const [payload, setPayload] = useState<WsWelcomePayload | null>(null);

  useEffect(() => onServerWelcome((nextPayload) => setPayload(nextPayload)), []);

  return payload;
}
