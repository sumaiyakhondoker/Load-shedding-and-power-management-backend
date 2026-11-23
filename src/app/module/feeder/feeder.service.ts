import type { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateFeederInput, ListFeedersQuery } from "./feeder.validation";

const list = async (query: ListFeedersQuery) => {
	const where: Prisma.FeederWhereInput = {
		deletedAt: null,
		substationId: query.substationId,
		OR: query.search
			? [
				{ name: { contains: query.search, mode: "insensitive" } },
				{ code: { contains: query.search, mode: "insensitive" } },
			]
			: undefined,
	};

	const [feeders, total] = await prisma.$transaction([
		prisma.feeder.findMany({
			where,
			select: {
				id: true,
				substationId: true,
				name: true,
				code: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.feeder.count({ where }),
	]);

	return {
		feeders,
		meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
	};
};

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

export const FeederService = { list, create };
