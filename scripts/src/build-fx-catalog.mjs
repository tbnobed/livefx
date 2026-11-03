// Generate the operation browser from the official, MIT-licensed API contract.
// Usage: node scripts/src/build-fx-catalog.mjs /path/to/assimilate_rest_api.yaml
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parse } from "yaml";

const spec = parse(await readFile(process.argv[2], "utf8"));
function resolve(schema, seen = new Set()) {
  if (!schema || typeof schema !== "object") return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { description: "Recursive reference", type: "object" };
    const next = new Set(seen).add(schema.$ref);
    const target = schema.$ref.split("/").slice(1).reduce((value, key) => value[key], spec);
    return resolve(target, next);
  }
  if (Array.isArray(schema)) return schema.map((value) => resolve(value, seen));
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => !key.startsWith("x-"))
    .map(([key, value]) => [key, resolve(value, seen)]));
}
function example(schema, depth = 0) {
  if (!schema || depth > 8) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  if (schema.oneOf || schema.anyOf) return example((schema.oneOf || schema.anyOf)[0], depth + 1);
  if (schema.type === "array") return [example(schema.items, depth + 1)];
  if (schema.type === "object" || schema.properties) {
    return Object.fromEntries(Object.entries(schema.properties || {})
      .filter(([, value]) => !value.readOnly && !/\(readonly\)/i.test(value.description || ""))
      .map(([key, value]) => [key, example(value, depth + 1)]));
  }
  if (schema.type === "boolean") return false;
  if (schema.type === "number" || schema.type === "integer") return schema.minimum ?? 0;
  return "";
}
const operations = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    const schema = resolve(operation.requestBody?.content?.["application/json"]?.schema);
    const queryParameters = [...(item.parameters || []), ...(operation.parameters || [])]
      .filter((param) => param.in === "query")
      .map((param) => `${param.name}${param.required ? " (required)" : ""}: ${param.description || ""}`);
    operations.push({
      id: operation.operationId || `${method}:${path}`,
      method: method.toUpperCase(),
      path,
      summary: operation.summary || path,
      description: `${operation.description || ""}${queryParameters.length ? "\nQuery parameters:\n" + queryParameters.join("\n") : ""}`,
      category: operation.tags?.[0] || "Other",
      bodyExample: schema ? JSON.stringify(example(schema), null, 2) : "",
      bodySchema: schema ? JSON.stringify(schema, null, 2) : "",
      bodyRequired: Boolean(operation.requestBody?.required),
      parameters: [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]),
      dangerous: method !== "get",
    });
  }
}
const directory = new URL("../../artifacts/api-server/src/data/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("assimilate-catalog.json", directory), JSON.stringify(operations, null, 2) + "\n");
console.log(`Generated ${operations.length} operations from Assimilate REST ${spec.info.version}.`);
