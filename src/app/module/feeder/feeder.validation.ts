import { z } from "zod";

export const createFeederSchema = z
	.object({
		substationId: z.uuid(),
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters")
			.max(255),
		code: z.string().trim().min(1, "Code is required").max(100),
	})
	.strict();

export type CreateFeederInput = z.infer<typeof createFeederSchema>;

export const listFeedersSchema = z
	.object({
		page: z.coerce.number().int().min(1).max(100000).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		substationId: z.uuid().optional(),
		search: z.string().trim().min(1).max(100).optional(),
	})
	.strict();

export type ListFeedersQuery = z.infer<typeof listFeedersSchema>;

export const feederIdSchema = z.uuid();

export const updateFeederSchema = createFeederSchema
	.partial()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});

export type UpdateFeederInput = z.infer<typeof updateFeederSchema>;
