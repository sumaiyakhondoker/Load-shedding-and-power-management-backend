import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateSubstationInput } from "./substation.validation";

const create = async (actorId: string, input: CreateSubstationInput) => {
	return prisma.$transaction(async (tx) => {
		const zone = await tx.distributionZone.findFirst({
			where: { id: input.zoneId, deletedAt: null },
			select: { id: true },
		});
		if (!zone) {
			throw new AppError(404, "Distribution zone not found");
		}

		const existingCode = await tx.substation.findUnique({
			where: { code: input.code },
			select: { id: true },
		});
		if (existingCode) {
			throw new AppError(409, "Substation code already exists");
		}

		const substation = await tx.substation.create({ data: input });

		await tx.auditLog.create({
			data: {
				actorId,
				action: "SUBSTATION_CREATED",
				entityType: "SUBSTATION",
				entityId: substation.id,
				details: {
					name: substation.name,
					code: substation.code,
					zoneId: substation.zoneId,
				},
			},
		});

		return substation;
	});
};

export const SubstationService = { create };
