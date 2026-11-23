import type { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateAreaInput, ListAreasQuery } from "./area.validation";

const list = async (query: ListAreasQuery) => {
	const where: Prisma.AreaWhereInput = {
		deletedAt: null,
		feederId: query.feederId,
		OR: query.search
			? [
				{ name: { contains: query.search, mode: "insensitive" } },
				{ address: { contains: query.search, mode: "insensitive" } },
			]
			: undefined,
	};

	const [areas, total] = await prisma.$transaction([
		prisma.area.findMany({
			where,
			select: {
				id: true,
				feederId: true,
				name: true,
				address: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.area.count({ where }),
	]);

	return {
		areas,
		meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
	};
};

const getById = async (areaId: string) => {
	const area = await prisma.area.findFirst({
		where: { id: areaId, deletedAt: null },
		select: {
			id: true,
			feederId: true,
			name: true,
			address: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	if (!area) {
		throw new AppError(404, "Area not found");
	}

	return area;
};

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

export const AreaService = { list, getById, create };
