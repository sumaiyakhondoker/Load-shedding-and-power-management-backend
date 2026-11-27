import type { Prisma } from "../../../../generated/prisma/client";
import type { UserRole } from "../../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	CreateOutageReportInput,
	AssignOutageReportInput,
	ListOutageReportsQuery,
	UpdateOutageReportStatusInput,
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

const getById = async (
	reportId: string,
	user: { id: string; role: UserRole },
) => {
	const report = await prisma.outageReport.findFirst({
		where: {
			id: reportId,
			deletedAt: null,
			reportedById: user.role === "CUSTOMER" ? user.id : undefined,
			assignedTechnicianId: user.role === "TECHNICIAN" ? user.id : undefined,
		},
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
	});
	if (!report) {
		throw new AppError(404, "Outage report not found");
	}

	return report;
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

const assign = async (
	actorId: string,
	reportId: string,
	input: AssignOutageReportInput,
) => {
	return prisma.$transaction(async (tx) => {
		const existingReport = await tx.outageReport.findFirst({
			where: { id: reportId, deletedAt: null },
			select: { status: true, assignedTechnicianId: true },
		});
		if (!existingReport) {
			throw new AppError(404, "Outage report not found");
		}
		if (!["REPORTED", "ASSIGNED"].includes(existingReport.status)) {
			throw new AppError(409, "This outage report cannot be assigned now");
		}
		if (existingReport.assignedTechnicianId === input.technicianId) {
			throw new AppError(
				400,
				"Outage report is already assigned to this technician",
			);
		}

		const technician = await tx.user.findFirst({
			where: { id: input.technicianId, role: "TECHNICIAN", deletedAt: null },
			select: { id: true },
		});
		if (!technician) {
			throw new AppError(404, "Active technician not found");
		}

		const updated = await tx.outageReport.updateMany({
			where: {
				id: reportId,
				deletedAt: null,
				status: existingReport.status,
				assignedTechnicianId: existingReport.assignedTechnicianId,
			},
			data: {
				assignedTechnicianId: input.technicianId,
				assignedAt: new Date(),
				status: "ASSIGNED",
			},
		});
		if (updated.count === 0) {
			throw new AppError(409, "Outage report changed; please retry");
		}

		const report = await tx.outageReport.findUniqueOrThrow({
			where: { id: reportId },
		});
		await tx.auditLog.create({
			data: {
				actorId,
				action: "OUTAGE_REPORT_ASSIGNED",
				entityType: "OUTAGE_REPORT",
				entityId: reportId,
				details: {
					previousTechnicianId: existingReport.assignedTechnicianId,
					technicianId: input.technicianId,
				},
			},
		});

		return report;
	});
};

const updateStatus = async (
	actor: { id: string; role: UserRole },
	reportId: string,
	input: UpdateOutageReportStatusInput,
) => {
	if (input.status === "REJECTED" && actor.role !== "ADMIN") {
		throw new AppError(403, "Only an admin can reject outage reports");
	}
	if (input.status !== "REJECTED" && actor.role !== "TECHNICIAN") {
		throw new AppError(403, "Only a technician can update work progress");
	}

	return prisma.$transaction(async (tx) => {
		const existingReport = await tx.outageReport.findFirst({
			where: {
				id: reportId,
				deletedAt: null,
				assignedTechnicianId:
					actor.role === "TECHNICIAN" ? actor.id : undefined,
			},
			select: { status: true },
		});
		if (!existingReport) {
			throw new AppError(404, "Outage report not found");
		}
		if (
			(input.status === "REJECTED" && existingReport.status !== "REPORTED") ||
			(input.status === "IN_PROGRESS" &&
				existingReport.status !== "ASSIGNED") ||
			(input.status === "RESOLVED" && existingReport.status !== "IN_PROGRESS")
		) {
			throw new AppError(409, "Invalid outage report status change");
		}

		const updated = await tx.outageReport.updateMany({
			where: {
				id: reportId,
				deletedAt: null,
				assignedTechnicianId:
					actor.role === "TECHNICIAN" ? actor.id : undefined,
				status: existingReport.status,
			},
			data:
				input.status === "RESOLVED"
					? {
							status: "RESOLVED",
							resolvedAt: new Date(),
							resolutionNote: input.resolutionNote,
						}
					: { status: input.status },
		});
		if (updated.count === 0) {
			throw new AppError(409, "Outage report changed; please retry");
		}

		const report = await tx.outageReport.findUniqueOrThrow({
			where: { id: reportId },
		});
		await tx.auditLog.create({
			data: {
				actorId: actor.id,
				action: "OUTAGE_REPORT_STATUS_CHANGED",
				entityType: "OUTAGE_REPORT",
				entityId: reportId,
				details: {
					previousStatus: existingReport.status,
					newStatus: input.status,
				},
			},
		});

		return report;
	});
};

export const OutageReportService = {
	list,
	getById,
	create,
	assign,
	updateStatus,
};
