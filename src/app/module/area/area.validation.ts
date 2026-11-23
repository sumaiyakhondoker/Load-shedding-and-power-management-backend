import { z } from "zod";

export const createAreaSchema = z
	.object({
		feederId: z.uuid(),
		name: z.string().trim().min(2, "Name must be at least 2 characters").max(255),
		address: z.string().trim().min(1).nullable().optional(),
	})
	.strict();

export type CreateAreaInput = z.infer<typeof createAreaSchema>;
