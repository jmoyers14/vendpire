import { generateOpenApiDocument } from "trpc-to-openapi";
import type { CreateDocumentOptions } from "zod-openapi";
import { appRouter } from "../router.ts";

type ResponseEntry = Record<string, unknown> & {
  $ref?: string;
  description?: string;
};

const ERROR_DESCRIPTIONS: Record<string, string> = {
  "400": "Invalid input data",
  "401": "Authorization not provided",
  "403": "Insufficient access",
  "404": "Not found",
  "426": "This build is below the supported floor; the client must update.",
  "500": "Internal server error",
};

function isReference(entry: ResponseEntry): boolean {
  return typeof entry.$ref === "string" && entry.description === undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// trpc-to-openapi reuses one response object across status codes that share
// an error body, so a description written for one leaks onto the other.
function relabelErrorResponses<T extends { paths?: unknown }>(document: T): T {
  if (!isObject(document.paths)) {
    return document;
  }
  for (const path of Object.values(document.paths)) {
    if (!isObject(path)) {
      continue;
    }
    for (const operation of Object.values(path)) {
      if (!isObject(operation) || !isObject(operation.responses)) {
        continue;
      }
      const responses = operation.responses as Record<string, ResponseEntry>;
      for (const [code, response] of Object.entries(responses)) {
        const description = ERROR_DESCRIPTIONS[code];
        if (!description || isReference(response)) {
          continue;
        }
        responses[code] = { ...response, description };
      }
    }
  }
  return document;
}

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
  return relabelErrorResponses(generateOpenApiDocument(appRouter, {
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
  }));
}
