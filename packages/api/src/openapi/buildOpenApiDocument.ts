import { generateOpenApiDocument } from "trpc-to-openapi";
import type { CreateDocumentOptions } from "zod-openapi";
import { appRouter } from "../router.ts";

/**
 * Collapses the two shapes the default rendering gets wrong for a native
 * client, and nothing else.
 */
const override: NonNullable<CreateDocumentOptions["override"]> = (ctx) => {
  const schema = ctx.jsonSchema as Record<string, unknown> & {
    anyOf?: Array<Record<string, unknown>>;
  };

  // 1. `anyOf: [{type: T}, {type: "null"}]` is how zod renders `.nullable()`.
  //    The canonical 3.1 spelling is `type: [T, "null"]`, which generators map
  //    to a plain optional instead of a wrapper enum. The entities are full of
  //    nullable fields, so this is the difference between `String?` and a
  //    generated anyOf container on every one of them.
  if (Array.isArray(schema.anyOf) && schema.anyOf.length === 2) {
    const nullArm = schema.anyOf.find((arm) => arm.type === "null");
    const valueArm = schema.anyOf.find((arm) => arm.type !== "null");
    if (nullArm && valueArm && typeof valueArm.type === "string") {
      delete schema.anyOf;
      Object.assign(schema, valueArm, { type: [valueArm.type, "null"] });
    }
  }

  // 2. Responses tolerate unknown keys, so adding a server field later cannot
  //    break a phone build compiled against today's document. Request bodies
  //    never carry additionalProperties in the first place — zod's `$strip`
  //    drops unknown input keys rather than rejecting them.
  if (ctx.io === "output") {
    delete schema.additionalProperties;
  }
};

/**
 * Builds the OpenAPI document from the router. Pure — writing it to disk is
 * `scripts/generateOpenApi.ts`, so the drift test can compare against this
 * without touching the filesystem.
 */
export function buildOpenApiDocument() {
  return generateOpenApiDocument(appRouter, {
    title: "Vendpire",
    description:
      "Sync surface for the Vendpire iOS app. Mirrors procedures the web dashboard calls over tRPC.",
    version: "1.0.0",
    baseUrl: "http://localhost:3210/api/v1",
    // 3.1.0 is not negotiable. Passing "3.0.3" prints `Invalid target:
    // openapi-3.0` and STILL emits 3.1 syntax, producing a document that lies
    // about its own version. Do not "fix" this string.
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
