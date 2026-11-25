import type { Prisma } from "../../../../generated/prisma/client";
import type { UserRole } from "../../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	CreateOutageReportInput,
	ListOutageReportsQuery,
} from "./outageReport.validation";

const list = async (
	query: ListOutageReportsQuery,
	user: { id: string; role: UserRole },
) => {
	const where: Prisma.OutageReportWhereInput = {
		deletedAt: null,
		areaId: query.areaId,
		status: query.status,
		priority: query.priority,
		reportedById: user.role === "CUSTOMER" ? user.id : undefined,
		assignedTechnicianId: user.role === "TECHNICIAN" ? user.id : undefined,
		OR: query.search
			? [
					{ title: { contains: query.search, mode: "insensitive" } },
					{ description: { contains: query.search, mode: "insensitive" } },
				]
			: undefined,
	};

	const [reports, total] = await prisma.$transaction([
		prisma.outageReport.findMany({
			where,
			select: {
				id: true,
				areaId: true,
				reportedById: true,
				assignedTechnicianId: true,
				title: true,
				description: true,
				status: true,
				priority: true,
				reportedAt: true,
				assignedAt: true,
				resolvedAt: true,
				resolutionNote: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: [{ reportedAt: "desc" }, { id: "desc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.outageReport.count({ where }),
	]);

	return {
		reports,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const create = async (customerId: string, input: CreateOutageReportInput) => {
	return prisma.$transaction(async (tx) => {
		const area = await tx.area.findFirst({
			where: { id: input.areaId, deletedAt: null },
			select: { id: true },
		});
		if (!area) {
			throw new AppError(404, "Area not found");
		}

		const report = await tx.outageReport.create({
			data: { ...input, reportedById: customerId, reportedAt: new Date() },
		});

		await tx.auditLog.create({
			data: {
				actorId: customerId,
				action: "OUTAGE_REPORT_CREATED",
				entityType: "OUTAGE_REPORT",
				entityId: report.id,
				details: { areaId: report.areaId, title: report.title },
			},
		});

		return report;
	});
};

export const OutageReportService = { list, create };
