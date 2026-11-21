import { z } from "zod";

export const registerSchema = z.object({
	name: z.string().trim().min(2).max(255),
	email: z.email().max(255),
	password: z.string().min(8).max(72),
	role: z
		.enum(["CUSTOMER", "TECHNICIAN"], {
			error: "Role must be CUSTOMER or TECHNICIAN",
		})
		.optional(),
});

export const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
});
