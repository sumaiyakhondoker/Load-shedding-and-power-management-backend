import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateAreaInput } from "./area.validation";

const create = async (actorId: string, input: CreateAreaInput) => {
	return prisma.$transaction(async (tx) => {
		const feeder = await tx.feeder.findFirst({
			where: { id: input.feederId, deletedAt: null },
			select: { id: true },
		});
		if (!feeder) {
			throw new AppError(404, "Feeder not found");
		}

		const area = await tx.area.create({ data: input });

		await tx.auditLog.create({
			data: {
				actorId,
				action: "AREA_CREATED",
				entityType: "AREA",
				entityId: area.id,
				details: { name: area.name, feederId: area.feederId },
			},
		});

		return area;
	});
};

export const AreaService = { create };
