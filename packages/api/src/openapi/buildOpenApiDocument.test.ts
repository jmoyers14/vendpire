import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020.js";
import { parse, stringify } from "yaml";
import { buildOpenApiDocument } from "./buildOpenApiDocument.ts";

const COMMITTED = path.join(import.meta.dir, "../../../../openapi/vendpire.yaml");

const EXPECTED_PATHS = [
  "/client-support",
  "/locations",
  "/machines",
  "/me",
  "/packs",
  "/planograms/current",
  "/products",
  "/purchases",
  "/visits",
  "/visits/latest",
];

describe("the committed OpenAPI document", () => {
  it("matches a fresh generation, so a schema change cannot ship un-regenerated", () => {
    const fresh = stringify(buildOpenApiDocument());
    const committed = readFileSync(COMMITTED, "utf8");

    expect(fresh).toBe(committed);
  });

  it("declares exactly the ten endpoints on the surface", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(Object.keys(document.paths).sort()).toEqual(EXPECTED_PATHS);
  });

  it("says it is OpenAPI 3.1 — the 3.0 target silently emits 3.1 syntax", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(document.openapi).toBe("3.1.0");
  });
});

describe("the surface's auth posture", () => {
  it("leaves client-support unsecured, or the wall cannot explain itself", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(document.paths["/client-support"].get.security).toBeUndefined();
  });

  it("secures every other endpoint", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    for (const route of EXPECTED_PATHS.filter((p) => p !== "/client-support")) {
      const operation =
        document.paths[route].get ?? document.paths[route].post;
      expect(operation.security).toEqual([{ bearer: [] }]);
    }
  });
});

describe("the shapes a Swift client has to decode", () => {
  it("emits named components rather than inlining a copy per endpoint", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        "Location",
        "Machine",
        "Product",
        "Pack",
        "Planogram",
        "Visit",
        "Purchase",
        "Identity",
        "ClientSupport",
      ]),
    );
    expect(
      document.paths["/locations"].get.responses["200"].content[
        "application/json"
      ].schema.items.$ref,
    ).toBe("#/components/schemas/Location");
  });

  it("spells nullable as a type array, not anyOf — Swift maps that to an optional", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(
      document.components.schemas.Location.properties.notes.type,
    ).toEqual(["string", "null"]);
    expect(stringify(document)).not.toContain("anyOf");
  });

  it("lets responses carry unknown keys, so a new server field cannot break an old build", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(
      document.components.schemas.Location.additionalProperties,
    ).toBeUndefined();
  });

  it("refs commission to a named component, not an inline copy", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(document.components.schemas.Location.properties.commission).toEqual(
      { $ref: "#/components/schemas/LocationCommission" },
    );
    expect(document.components.schemas.LocationCommission.oneOf).toHaveLength(
      3,
    );
  });

  it("accepts a null removedReason — most visit lines have nothing removed", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(document.components.schemas.Visit);

    const visit = {
      id: "visit_1",
      machineId: "machine_1",
      locationId: "location_1",
      planogramId: "planogram_1",
      countedAt: "2026-10-21T00:00:00.000Z",
      recordedByUserId: "user_1",
      lines: [
        {
          slotCode: "A1",
          productId: "product_1",
          remaining: 10,
          added: 0,
          removed: 0,
          removedReason: null,
          priceCents: 150,
          par: 12,
          bestBy: null,
        },
      ],
      notes: null,
      clientRequestId: "request_1",
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    };

    expect(validate(visit)).toBe(true);
  });
});

describe("document validity", () => {
  it("is a valid OpenAPI document — the only check before Phase 7's Swift build", async () => {
    // validate() mutates its input by resolving $refs, so hand it a clone.
    const document = parse(readFileSync(COMMITTED, "utf8"));

    await expect(SwaggerParser.validate(document)).resolves.toBeDefined();
  });
});
