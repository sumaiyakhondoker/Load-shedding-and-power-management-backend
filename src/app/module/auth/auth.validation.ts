import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.email().max(255),
  password: z.string().min(8).max(72),
});
