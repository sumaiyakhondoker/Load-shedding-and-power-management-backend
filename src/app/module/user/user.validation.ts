import { z } from "zod";

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    phone: z.string().trim().min(1).max(30).nullable().optional(),
    areaId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
