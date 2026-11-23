import { z } from "zod";

export const createFeederSchema = z
	.object({
		substationId: z.uuid(),
		name: z.string().trim().min(2, "Name must be at least 2 characters").max(255),
		code: z.string().trim().min(1, "Code is required").max(100),
	})
	.strict();

export type CreateFeederInput = z.infer<typeof createFeederSchema>;
