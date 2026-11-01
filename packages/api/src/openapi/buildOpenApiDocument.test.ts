import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020.js";
import { parse, stringify } from "yaml";
import { buildOpenApiDocument } from "./buildOpenApiDocument.ts";

const COMMITTED = path.join(import.meta.dir, "../../../../openapi/vendpire.yaml");

const EXPECTED_PATHS = [
  "/barcode-candidate",
  "/client-support",
  "/locations",
  "/machines",
  "/me",
  "/packs",
  "/packs/{id}/barcode",
  "/planograms/current",
  "/products",
  "/products/{id}/barcode",
  "/purchases",
  "/visits",
  "/visits/latest",
];

// Read once: every assertion below only reads it.
const document = parse(readFileSync(COMMITTED, "utf8"));

describe("the committed OpenAPI document", () => {
  it("matches a fresh generation, so a schema change cannot ship un-regenerated", () => {
    const fresh = stringify(buildOpenApiDocument());
    const committed = readFileSync(COMMITTED, "utf8");

    expect(fresh).toBe(committed);
  });

  it("declares exactly the thirteen endpoints on the surface", () => {
    expect(Object.keys(document.paths).sort()).toEqual(EXPECTED_PATHS);
  });

  it("says it is OpenAPI 3.1 — the 3.0 target silently emits 3.1 syntax", () => {
    expect(document.openapi).toBe("3.1.0");
  });
});

describe("the surface's auth posture", () => {
  it("leaves client-support unsecured, or the wall cannot explain itself", () => {
    expect(document.paths["/client-support"].get.security).toBeUndefined();
  });

  it("secures every other endpoint", () => {
    for (const route of EXPECTED_PATHS.filter((p) => p !== "/client-support")) {
      const operation =
        document.paths[route].get ?? document.paths[route].post ?? document.paths[route].put;
      expect(operation.security).toEqual([{ bearer: [] }]);
    }
  });

  it("creates products and packs over REST — the scanner's create path", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));
    expect(document.paths["/products"].post.operationId).toBe("createProduct");
    expect(document.paths["/packs"].post.operationId).toBe("createPack");
    expect(document.paths["/products"].post.security).toEqual([{ bearer: [] }]);
    expect(document.paths["/packs"].post.security).toEqual([{ bearer: [] }]);
  });

  it("attaches barcodes through narrow PUT routes", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));
    expect(document.paths["/products/{id}/barcode"].put.operationId).toBe("attachProductBarcode");
    expect(document.paths["/packs/{id}/barcode"].put.operationId).toBe("attachPackBarcode");
  });

  it("gives barcode routes route-specific 404 descriptions", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));
    expect(document.paths["/products/{id}/barcode"].put.responses["404"].description).toBe("No such product");
    expect(document.paths["/packs/{id}/barcode"].put.responses["404"].description).toBe("No such pack");
  });

  it("gives each status its own description — the generator shares one response object", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));
    const operation = document.paths["/locations"].get;

    expect(operation.responses["426"].description).toBe(
      "This build is below the supported floor; the client must update.",
    );
    expect(operation.responses["500"].description).toBe("Internal server error");
    expect(operation.responses["426"].description).not.toBe(
      operation.responses["500"].description,
    );
  });
});

describe("the shapes a Swift client has to decode", () => {
  it("emits named components rather than inlining a copy per endpoint", () => {
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        "Candidate",
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
    expect(
      document.components.schemas.Location.properties.notes.type,
    ).toEqual(["string", "null"]);
    expect(stringify(document)).not.toContain("anyOf");
  });

  it("lets responses carry unknown keys, so a new server field cannot break an old build", () => {
    expect(
      document.components.schemas.Location.additionalProperties,
    ).toBeUndefined();
  });

  it("refs commission to a named component, not an inline copy", () => {
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

  it("serves the barcode candidate as a flat nullable object — no oneOf", () => {
    // Component definition: flat object with nullable properties
    const candidate = document.components.schemas.Candidate;
    expect(candidate.type).toBe("object");
    expect(Object.keys(candidate.properties).sort()).toEqual([
      "brand",
      "imageUrl",
      "name",
    ]);

    // Response schema: inlined with type: ["object","null"], no $ref/anyOf/oneOf
    const responseSchema =
      document.paths["/barcode-candidate"].get.responses["200"].content[
        "application/json"
      ].schema;
    expect(responseSchema.$ref).toBeUndefined();
    expect(responseSchema.anyOf).toBeUndefined();
    expect(responseSchema.oneOf).toBeUndefined();
    expect(responseSchema.type).toEqual(["object", "null"]);

    // Validate with ajv: both null and full candidate object
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(responseSchema);
    expect(validate(null)).toBe(true);
    expect(validate({ name: "Coke Zero 12oz", brand: "Coca-Cola", imageUrl: null })).toBe(true);
  });

  it("declares money and counts as integers, so Swift gets Int and not Double", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));
    const schemas = document.components.schemas;

    const moneyAndCounts = [
      schemas.Product.properties.defaultPriceCents,
      schemas.Planogram.properties.slots.items.properties.par,
      schemas.Planogram.properties.slots.items.properties.priceCents,
      schemas.Pack.properties.contents.items.properties.units,
      schemas.Visit.properties.lines.items.properties.remaining,
      schemas.Visit.properties.lines.items.properties.added,
      schemas.Visit.properties.lines.items.properties.removed,
      schemas.Visit.properties.lines.items.properties.priceCents,
      schemas.Purchase.properties.lines.items.properties.units,
      schemas.Purchase.properties.lines.items.properties.totalCostCents,
      // LocationCommission is a oneOf: [none, percent, flat].
      schemas.LocationCommission.oneOf[1].properties.percentBps,
      schemas.LocationCommission.oneOf[2].properties.flatCents,
    ];

    for (const property of moneyAndCounts) {
      expect(property.type).toBe("integer");
    }

    // The nullable ones spell the type as an array; "number" must not appear.
    expect(schemas.Visit.properties.lines.items.properties.par.type).toEqual([
      "integer",
      "null",
    ]);
    expect(schemas.Purchase.properties.receiptTotalCents.type).toEqual([
      "integer",
      "null",
    ]);
  });
});

describe("document validity", () => {
  it("is a valid OpenAPI document — the only check before the generated Swift client consumes it", async () => {
    // validate() mutates its input by resolving $refs, so hand it a clone.
    await expect(SwaggerParser.validate(document)).resolves.toBeDefined();
  });
});
