import { z } from "zod";

export const createDistributionZoneSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(255),
    description: z.string().trim().min(10, "Description must be at least 10 characters").nullable().optional(),
  })
  .strict();

export type CreateDistributionZoneInput = z.infer<typeof createDistributionZoneSchema>;

export const listDistributionZonesSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type ListDistributionZonesQuery = z.infer<typeof listDistributionZonesSchema>;
