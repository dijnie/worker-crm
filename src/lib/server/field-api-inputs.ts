import { z } from "zod/v3";
import { FIELD_ENTITIES } from "../db/schema/constants";
import { identifier } from "../utils/validation";

export const fieldListInput = z.object({
  entity: z.enum(FIELD_ENTITIES), includeArchived: z.boolean().default(false),
}).strict();

export const optionListInput = z.object({ includeArchived: z.boolean().default(false) }).strict();
export const fieldValuesInput = z.object({ entity: z.enum(FIELD_ENTITIES), entityId: identifier }).strict();
export const fieldValueInput = fieldValuesInput.extend({ value: z.unknown() }).strict()
  .refine(body => Object.hasOwn(body, "value"), { message: "Value is required", path: ["value"] });
