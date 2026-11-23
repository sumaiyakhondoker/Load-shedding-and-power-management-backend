import { z } from "zod";

export const createSubstationSchema = z
	.object({
		zoneId: z.uuid(),
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters")
			.max(255),
		code: z.string().trim().min(1, "Code is required").max(100),
		address: z.string().trim().min(1).nullable().optional(),
	})
	.strict();

export type CreateSubstationInput = z.infer<typeof createSubstationSchema>;

export const listSubstationsSchema = z
	.object({
		page: z.coerce.number().int().min(1).max(100000).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		zoneId: z.uuid().optional(),
		search: z.string().trim().min(1).max(100).optional(),
	})
	.strict();

export type ListSubstationsQuery = z.infer<typeof listSubstationsSchema>;

export const substationIdSchema = z.uuid();

export const updateSubstationSchema = createSubstationSchema
	.partial()
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field is required",
	});

export type UpdateSubstationInput = z.infer<typeof updateSubstationSchema>;
