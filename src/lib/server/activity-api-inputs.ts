import { z } from "zod/v3";
import { activityCreateShape, refineActivityCreate } from "@services/activity.service";

export const createActivityApiInput = z.object(activityCreateShape).strict().superRefine(refineActivityCreate);
export type CreateActivityApiInput = z.input<typeof createActivityApiInput>;
