import { generateOpenApiDocument } from "trpc-to-openapi";
import type { CreateDocumentOptions } from "zod-openapi";
import { appRouter } from "../router.ts";

/** Fixes the two shapes the default rendering gets wrong for a native client. */
const override: NonNullable<CreateDocumentOptions["override"]> = (ctx) => {
  const schema = ctx.jsonSchema as Record<string, unknown> & {
    anyOf?: Array<Record<string, unknown>>;
    enum?: unknown[];
    const?: unknown;
  };

  // zod renders `.nullable()` as a 2-arm anyOf; the canonical 3.1 `type: [T,
  // "null"]` is what generators map to a plain optional. Multi-arm unions and
  // oneOf are untouched.
  if (Array.isArray(schema.anyOf) && schema.anyOf.length === 2) {
    const nullArm = schema.anyOf.find((arm) => arm.type === "null");
    const valueArm = schema.anyOf.find((arm) => arm.type !== "null");
    if (nullArm && valueArm && typeof valueArm.type === "string") {
      delete schema.anyOf;
      Object.assign(schema, valueArm, { type: [valueArm.type, "null"] });

      // `enum`/`const` constrain every instance, not just the value type, so a
      // collapsed nullable must admit null explicitly or it contradicts its own `type`.
      if (Array.isArray(schema.enum)) {
        schema.enum = [...schema.enum, null];
      }
      if ("const" in schema) {
        schema.enum = [schema.const, null];
        delete schema.const;
      }
    }
  }

  // Responses tolerate unknown keys, so a field added later cannot break an
  // older phone build. Inputs never carry it — zod's `$strip` already drops
  // unknown keys rather than rejecting them.
  if (ctx.io === "output") {
    delete schema.additionalProperties;
  }
};

/** Pure, so the drift test can compare against it. Writing to disk is scripts/generateOpenApi.ts. */
export function buildOpenApiDocument() {
  return generateOpenApiDocument(appRouter, {
    title: "Vendpire",
    description:
      "Sync surface for the Vendpire iOS app. Mirrors procedures the web dashboard calls over tRPC.",
    version: "1.0.0",
    baseUrl: "http://localhost:3210/api/v1",
    // Do not "fix" this to 3.0.3 — that target still emits 3.1 syntax, under
    // a label that lies about it.
    openApiVersion: "3.1.0",
    securitySchemes: {
      bearer: {
        type: "http",
        scheme: "bearer",
        description: "A Clerk session token.",
      },
    },
    // "inline", not "ref": named components come from .meta({ id }) either way,
    // and "ref" also hoists 119 anonymous sub-schemas as __schemaN junk types.
    options: { reused: "inline", override },
  });
}
