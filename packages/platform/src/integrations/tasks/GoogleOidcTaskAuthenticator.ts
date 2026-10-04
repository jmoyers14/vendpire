import { OAuth2Client } from "google-auth-library";
import { inject, injectable } from "tsyringe";
import { TASKS_CONFIG_TOKEN, type TasksConfig } from "./tasksConfig.ts";
import {
  extractBearerToken,
  isTrustedTaskCaller,
  type TaskAuthenticator,
} from "./TaskAuthenticator.ts";

/**
 * Production guard for `/tasks/*`. Verifies the OIDC token Cloud Tasks attaches
 * when it calls the worker back.
 *
 * Two independent checks, both required:
 *  1. **Authenticity** — google-auth-library validates the token's signature
 *     against Google's public certs and that its `aud` matches `workerUrl` (the
 *     audience CloudTasksQueue set when creating the task). A forged or
 *     wrong-audience token can't pass; the certs are fetched and cached by the
 *     client, so steady-state verification is local.
 *  2. **Authorization** — the token must be issued as our invoker service
 *     account. Anyone could, in principle, mint a Google OIDC token; only our
 *     queue mints one as this SA for this audience.
 *
 * Fails closed: any missing token, bad signature, wrong audience, or wrong
 * issuer returns false, and the route turns false into 403. Same config as the
 * queue (workerUrl, invokerServiceAccount), so the audience the queue signs and
 * the audience we verify come from one source and can't drift.
 */
@injectable()
export class GoogleOidcTaskAuthenticator implements TaskAuthenticator {
  private readonly client = new OAuth2Client();

  constructor(
    @inject(TASKS_CONFIG_TOKEN)
    private readonly config: TasksConfig,
  ) {}

  async authenticate(request: Request): Promise<boolean> {
    const token = extractBearerToken(request);
    if (!token) {
      return false;
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience: this.config.workerUrl,
      });
      return isTrustedTaskCaller(
        ticket.getPayload(),
        this.config.invokerServiceAccount,
      );
    } catch {
      // A verification failure on this endpoint is an unauthorized caller, not
      // an exceptional condition — deny quietly.
      return false;
    }
  }
}
