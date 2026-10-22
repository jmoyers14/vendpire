import { writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { buildOpenApiDocument } from "../src/openapi/buildOpenApiDocument.ts";

const OUTPUT = path.join(import.meta.dir, "../../../openapi/vendpire.yaml");

const document = buildOpenApiDocument();
writeFileSync(OUTPUT, stringify(document), "utf8");
console.log(`wrote ${OUTPUT}`);
