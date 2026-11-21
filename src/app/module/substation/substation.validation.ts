import { z } from "zod";

export const createSubstationSchema = z
  .object({
    zoneId: z.uuid(),
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(255),
    code: z.string().trim().min(1, "Code is required").max(100),
    address: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export type CreateSubstationInput = z.infer<typeof createSubstationSchema>;
