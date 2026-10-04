/**
 * A job that can never succeed however many times it runs — a payload that
 * doesn't parse, a raw event that isn't there, a tenant mismatch.
 *
 * The distinction matters because the runner can't otherwise tell a transient
 * failure from a permanent one inside a catch, and defaults to "transient" (500,
 * retry). Throwing this says: record the reason and ack (200). Burning the
 * queue's attempts on work that cannot succeed just delays the failure showing
 * up.
 */
export class PoisonJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoisonJobError";
  }
}
