import { z } from "zod";

export const createAreaSchema = z
	.object({
		feederId: z.uuid(),
		name: z.string().trim().min(2, "Name must be at least 2 characters").max(255),
		address: z.string().trim().min(1).nullable().optional(),
	})
	.strict();

export type CreateAreaInput = z.infer<typeof createAreaSchema>;

export const listAreasSchema = z
	.object({
		page: z.coerce.number().int().min(1).max(100000).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		feederId: z.uuid().optional(),
		search: z.string().trim().min(1).max(100).optional(),
	})
	.strict();

export type ListAreasQuery = z.infer<typeof listAreasSchema>;
