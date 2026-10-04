import { injectable } from "tsyringe";
import type { TaskAuthenticator } from "./TaskAuthenticator.ts";

/**
 * Local-development authenticator: allows every request to `/tasks/*`.
 *
 * Safe only because it's registered ONLY when environment is local, where the
 * queue is InlineTaskQueue looping back to localhost with no token to check.
 * The composition root (registerWebhookCore) picks this by environment, exactly
 * as it picks InlineTaskQueue vs CloudTasksQueue — the two always agree, so an
 * unauthenticated local caller can only reach a loopback queue.
 */
@injectable()
export class AllowAllTaskAuthenticator implements TaskAuthenticator {
  async authenticate(): Promise<boolean> {
    return true;
  }
}
