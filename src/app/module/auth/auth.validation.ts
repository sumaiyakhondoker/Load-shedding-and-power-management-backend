import { z } from "zod";

export const registerSchema = z.object({
	name: z.string().trim().min(2).max(255),
	email: z.email().max(255),
	password: z.string().min(8).max(72),
	role: z.literal("CUSTOMER").optional(),
});

export const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1),
});

export const googleLoginSchema = z.strictObject({
	idToken: z.string().trim().min(1),
});

export const demoLoginSchema = z.strictObject({
	role: z.enum(["ADMIN", "TECHNICIAN", "CUSTOMER"]),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type DemoLoginInput = z.infer<typeof demoLoginSchema>;
