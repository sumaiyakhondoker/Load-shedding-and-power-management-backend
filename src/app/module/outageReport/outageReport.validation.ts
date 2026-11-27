import { z } from "zod";
import {
	OutagePriority,
	OutageStatus,
} from "../../../../generated/prisma/enums";

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

export const listOutageReportsSchema = z
	.object({
		page: z.coerce.number().int().min(1).max(100000).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		areaId: z.uuid().optional(),
		status: z.enum(OutageStatus).optional(),
		priority: z.enum(OutagePriority).optional(),
		search: z.string().trim().min(1).max(100).optional(),
	})
	.strict();

export type ListOutageReportsQuery = z.infer<typeof listOutageReportsSchema>;

export const outageReportIdSchema = z.uuid();

export const assignOutageReportSchema = z
	.object({ technicianId: z.uuid() })
	.strict();

export type AssignOutageReportInput = z.infer<typeof assignOutageReportSchema>;

export const updateOutageReportStatusSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("REJECTED") }).strict(),
	z.object({ status: z.literal("IN_PROGRESS") }).strict(),
	z
		.object({
			status: z.literal("RESOLVED"),
			resolutionNote: z.string().trim().min(1, "Resolution note is required"),
		})
		.strict(),
]);

export type UpdateOutageReportStatusInput = z.infer<
	typeof updateOutageReportStatusSchema
>;
