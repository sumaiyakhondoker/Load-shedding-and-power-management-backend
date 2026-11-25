import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateOutageReportInput } from "./outageReport.validation";

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

export const OutageReportService = { create };
