import { z } from "zod/v3";
import { FIELD_ENTITIES, FIELD_TYPES } from "../db/schema/constants";
import { identifier } from "../utils/validation";

export const fieldListInput = z.object({
  entity: z.enum(FIELD_ENTITIES), includeArchived: z.boolean().default(false),
}).strict();

export const optionListInput = z.object({ includeArchived: z.boolean().default(false) }).strict();
export const fieldValuesInput = z.object({ entity: z.enum(FIELD_ENTITIES), entityId: identifier }).strict();
export const reorderFieldsInput = z.object({ entity: z.enum(FIELD_ENTITIES), ids: z.array(identifier) }).strict();
export const fieldValueInput = fieldValuesInput.extend({ value: z.unknown(), expectedType: z.enum(FIELD_TYPES).optional() }).strict()
  .refine(body => Object.hasOwn(body, "value"), { message: "Value is required", path: ["value"] });
