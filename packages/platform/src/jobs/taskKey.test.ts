import { describe, expect, it } from "bun:test";
import { taskBodySchema, taskName } from "./taskKey.ts";

describe("taskName", () => {
  it("replaces every character Cloud Tasks disallows", () => {
    // Names may contain only [A-Za-z0-9_-]; the colons in our own key and the
    // colon inside a Clerk role string all have to go.
    expect(taskName("syncUser", "clerk:msg_2abc", 0)).toBe(
      "syncUser_clerk_msg_2abc_0",
    );
  });

  it("keeps letters, digits, underscores and hyphens as-is", () => {
    expect(taskName("syncOrg", "clerk-msg_1", 2)).toBe("syncOrg_clerk-msg_1_2");
  });

  it("gives the same event a different name per job type", () => {
    // One event legitimately fanning out to two jobs must not self-collide.
    const a = taskName("syncOrg", "clerk:msg_1", 0);
    const b = taskName("syncOrgMembership", "clerk:msg_1", 0);
    expect(a).not.toBe(b);
  });

  it("changes the name when attempts changes, so a manual retry is a new task", () => {
    // This is the whole reason attempts is in the name: Cloud Tasks keeps a name
    // reserved after completion, so retrying a failed job under its original
    // name would be silently refused as a duplicate.
    const first = taskName("syncUser", "clerk:msg_1", 0);
    const retry = taskName("syncUser", "clerk:msg_1", 1);
    expect(retry).not.toBe(first);
  });

  it("produces an identical name for an accidental re-enqueue of the same attempt", () => {
    // The flip side: same attempt ⇒ same name ⇒ the queue refuses the duplicate.
    expect(taskName("syncUser", "clerk:msg_1", 0)).toBe(
      taskName("syncUser", "clerk:msg_1", 0),
    );
  });
});

describe("taskBodySchema", () => {
  it("accepts a body carrying only the dedup key", () => {
    expect(taskBodySchema.parse({ dedupKey: "clerk:msg_1" })).toEqual({
      dedupKey: "clerk:msg_1",
    });
  });

  it("rejects a missing or empty dedup key", () => {
    expect(taskBodySchema.safeParse({}).success).toBe(false);
    expect(taskBodySchema.safeParse({ dedupKey: "" }).success).toBe(false);
  });
});
