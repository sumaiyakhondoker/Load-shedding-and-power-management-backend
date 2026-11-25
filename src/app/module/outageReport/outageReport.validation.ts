import { z } from "zod";

export const createOutageReportSchema = z
	.object({
		areaId: z.uuid(),
		title: z
			.string()
			.trim()
			.min(2, "Title must be at least 2 characters")
			.max(255),
		description: z.string().trim().min(1, "Description is required"),
	})
	.strict();

export type CreateOutageReportInput = z.infer<typeof createOutageReportSchema>;
