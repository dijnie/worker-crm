import type { OpenAPIV3 } from "openapi-types";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type Schema = OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;

export function reference(name: string): OpenAPIV3.ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

export function arrayOf(items: Schema): OpenAPIV3.ArraySchemaObject {
  return { type: "array", items };
}

export function objectOf(properties: Record<string, Schema>): OpenAPIV3.SchemaObject {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export function inputSchema(schema: z.ZodTypeAny): OpenAPIV3.SchemaObject {
  return zodToJsonSchema(schema, {
    target: "openApi3",
    effectStrategy: "input",
    pipeStrategy: "input",
    $refStrategy: "none",
  }) as OpenAPIV3.SchemaObject;
}

export function annotateProperty(schema: OpenAPIV3.SchemaObject, name: string, annotation: OpenAPIV3.SchemaObject): void {
  const property = schema.properties?.[name];
  if (!property || "$ref" in property) throw new Error(`Expected an inline property schema: ${name}`);
  schema.properties![name] = { ...property, ...annotation };
}
