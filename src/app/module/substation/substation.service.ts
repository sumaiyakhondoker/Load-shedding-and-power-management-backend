import type { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateSubstationInput, ListSubstationsQuery } from "./substation.validation";

const list = async (query: ListSubstationsQuery) => {
	const where: Prisma.SubstationWhereInput = {
		deletedAt: null,
		zoneId: query.zoneId,
		OR: query.search
			? [
				{ name: { contains: query.search, mode: "insensitive" } },
				{ code: { contains: query.search, mode: "insensitive" } },
			]
			: undefined,
	};

	const [substations, total] = await prisma.$transaction([
		prisma.substation.findMany({
			where,
			select: {
				id: true,
				zoneId: true,
				name: true,
				code: true,
				address: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.substation.count({ where }),
	]);

	return {
		substations,
		meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
	};
};

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

export const SubstationService = { list, create };
