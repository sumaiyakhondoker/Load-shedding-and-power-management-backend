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
