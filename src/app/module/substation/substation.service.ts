import type { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	CreateSubstationInput,
	ListSubstationsQuery,
	UpdateSubstationInput,
} from "./substation.validation";

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
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const getById = async (substationId: string) => {
	const substation = await prisma.substation.findFirst({
		where: { id: substationId, deletedAt: null },
		select: {
			id: true,
			zoneId: true,
			name: true,
			code: true,
			address: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	if (!substation) {
		throw new AppError(404, "Substation not found");
	}

	return substation;
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

const update = async (
	actorId: string,
	substationId: string,
	input: UpdateSubstationInput,
) => {
	return prisma.$transaction(async (tx) => {
		const existingSubstation = await tx.substation.findFirst({
			where: { id: substationId, deletedAt: null },
			select: { id: true },
		});
		if (!existingSubstation) {
			throw new AppError(404, "Substation not found");
		}

		if (input.zoneId) {
			const zone = await tx.distributionZone.findFirst({
				where: { id: input.zoneId, deletedAt: null },
				select: { id: true },
			});
			if (!zone) {
				throw new AppError(404, "Distribution zone not found");
			}
		}

		if (input.code) {
			const existingCode = await tx.substation.findUnique({
				where: { code: input.code },
				select: { id: true },
			});
			if (existingCode && existingCode.id !== substationId) {
				throw new AppError(409, "Substation code already exists");
			}
		}

		const substation = await tx.substation.update({
			where: { id: substationId },
			data: input,
		});

		await tx.auditLog.create({
			data: {
				actorId,
				action: "SUBSTATION_UPDATED",
				entityType: "SUBSTATION",
				entityId: substation.id,
				details: { changes: input },
			},
		});

		return substation;
	});
};

const remove = async (actorId: string, substationId: string) => {
	return prisma.$transaction(async (tx) => {
		const existingSubstation = await tx.substation.findFirst({
			where: { id: substationId, deletedAt: null },
			select: { id: true, name: true, code: true },
		});
		if (!existingSubstation) {
			throw new AppError(404, "Substation not found");
		}

		const activeFeeder = await tx.feeder.findFirst({
			where: { substationId, deletedAt: null },
			select: { id: true },
		});
		if (activeFeeder) {
			throw new AppError(409, "Cannot delete a substation with active feeders");
		}

		const substation = await tx.substation.update({
			where: { id: substationId },
			data: { deletedAt: new Date() },
			select: { id: true },
		});

		await tx.auditLog.create({
			data: {
				actorId,
				action: "SUBSTATION_DELETED",
				entityType: "SUBSTATION",
				entityId: substation.id,
				details: {
					name: existingSubstation.name,
					code: existingSubstation.code,
				},
			},
		});

		return substation;
	});
};

export const SubstationService = { list, getById, create, update, remove };
