import "server-only";
import { isPaddleLiveTestRuntimeReady } from "./live-test";
import { isPaddleSandboxTestRuntimeReady } from "./sandbox-test";

export function isPaddleControlledTestRuntimeReady(email: string | null | undefined) {
  return isPaddleSandboxTestRuntimeReady(email) || isPaddleLiveTestRuntimeReady(email);
}
