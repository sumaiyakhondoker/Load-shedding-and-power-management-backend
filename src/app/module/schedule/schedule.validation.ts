import { ScheduleStatus } from "../../../../generated/prisma/enums";
import { z } from "zod";

const dateTimeSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const createScheduleSchema = z
	.object({
		areaId: z.uuid(),
		title: z.string().trim().min(2, "Title must be at least 2 characters").max(255),
		reason: z.string().trim().min(1).nullable().optional(),
		startsAt: dateTimeSchema,
		endsAt: dateTimeSchema,
	})
	.strict()
	.refine((data) => data.startsAt < data.endsAt, {
		path: ["endsAt"],
		message: "End time must be after start time",
	});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const listSchedulesSchema = z
	.object({
		page: z.coerce.number().int().min(1).max(100000).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		areaId: z.uuid().optional(),
		status: z.enum(ScheduleStatus).optional(),
	})
	.strict();

export type ListSchedulesQuery = z.infer<typeof listSchedulesSchema>;
