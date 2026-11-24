import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateScheduleInput } from "./schedule.validation";

const create = async (actorId: string, input: CreateScheduleInput) => {
	return prisma.$transaction(async (tx) => {
		const area = await tx.area.findFirst({
			where: { id: input.areaId, deletedAt: null },
			select: { id: true },
		});
		if (!area) {
			throw new AppError(404, "Area not found");
		}

		const schedule = await tx.loadSheddingSchedule.create({
			data: { ...input, createdById: actorId },
		});

		await tx.auditLog.create({
			data: {
				actorId,
				action: "SCHEDULE_CREATED",
				entityType: "LOAD_SHEDDING_SCHEDULE",
				entityId: schedule.id,
				details: { title: schedule.title, areaId: schedule.areaId },
			},
		});

		return schedule;
	});
};

export const ScheduleService = { create };
