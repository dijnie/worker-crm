import { z } from "zod/v3";
import { stageShape } from "@services/deal.service";

export const stageApiInput = z.object(stageShape).strict();
export type StageApiInput = z.input<typeof stageApiInput>;
