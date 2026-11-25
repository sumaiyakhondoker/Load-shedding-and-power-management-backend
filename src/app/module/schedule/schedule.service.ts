import { Prisma } from "../../../../generated/prisma/client";
import type { UserRole } from "../../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	CreateScheduleInput,
	ListSchedulesQuery,
} from "./schedule.validation";

const list = async (query: ListSchedulesQuery, role: UserRole) => {
	const where: Prisma.LoadSheddingScheduleWhereInput = {
		deletedAt: null,
		areaId: query.areaId,
		status: query.status,
		NOT: role === "ADMIN" ? undefined : { status: "DRAFT" },
	};

	const [schedules, total] = await prisma.$transaction([
		prisma.loadSheddingSchedule.findMany({
			where,
			select: {
				id: true,
				areaId: true,
				createdById: true,
				title: true,
				reason: true,
				startsAt: true,
				endsAt: true,
				status: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: [{ startsAt: "asc" }, { id: "asc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.loadSheddingSchedule.count({ where }),
	]);

	return {
		schedules,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const create = async (actorId: string, input: CreateScheduleInput) => {
	try {
		return await prisma.$transaction(
			async (tx) => {
				const area = await tx.area.findFirst({
					where: { id: input.areaId, deletedAt: null },
					select: { id: true },
				});
				if (!area) {
					throw new AppError(404, "Area not found");
				}

				const overlappingSchedule = await tx.loadSheddingSchedule.findFirst({
					where: {
						areaId: input.areaId,
						deletedAt: null,
						NOT: { status: "CANCELLED" },
						startsAt: { lt: input.endsAt },
						endsAt: { gt: input.startsAt },
					},
					select: { id: true },
				});
				if (overlappingSchedule) {
					throw new AppError(
						409,
						"Schedule overlaps with an existing schedule in this area",
					);
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
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
		);
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2034"
		) {
			throw new AppError(409, "Schedule conflict; please retry");
		}
		throw error;
	}
};

export const ScheduleService = { list, create };
