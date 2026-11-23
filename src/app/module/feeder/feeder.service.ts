import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateFeederInput } from "./feeder.validation";

const create = async (actorId: string, input: CreateFeederInput) => {
	return prisma.$transaction(async (tx) => {
		const substation = await tx.substation.findFirst({
			where: { id: input.substationId, deletedAt: null },
			select: { id: true },
		});
		if (!substation) {
			throw new AppError(404, "Substation not found");
		}

		const existingCode = await tx.feeder.findUnique({
			where: { substationId_code: { substationId: input.substationId, code: input.code } },
			select: { id: true },
		});
		if (existingCode) {
			throw new AppError(409, "Feeder code already exists in this substation");
		}

		const feeder = await tx.feeder.create({ data: input });

		await tx.auditLog.create({
			data: {
				actorId,
				action: "FEEDER_CREATED",
				entityType: "FEEDER",
				entityId: feeder.id,
				details: { name: feeder.name, code: feeder.code, substationId: feeder.substationId },
			},
		});

		return feeder;
	});
};

export const FeederService = { create };
