import type { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	ListAuditLogsQuery,
	ListUsersQuery,
	UpdateUserRoleInput,
} from "./admin.validation";

const listUsers = async (query: ListUsersQuery) => {
	const where: Prisma.UserWhereInput = {
		deletedAt: null,
		role: query.role,
		OR: query.search
			? [
					{ name: { contains: query.search, mode: "insensitive" } },
					{ email: { contains: query.search, mode: "insensitive" } },
				]
			: undefined,
	};

	const [users, total] = await prisma.$transaction([
		prisma.user.findMany({
			where,
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				phone: true,
				areaId: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.user.count({ where }),
	]);

	return {
		users,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const listAuditLogs = async (query: ListAuditLogsQuery) => {
	const [auditLogs, total] = await prisma.$transaction([
		prisma.auditLog.findMany({
			select: {
				id: true,
				actorId: true,
				action: true,
				entityType: true,
				entityId: true,
				details: true,
				createdAt: true,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.auditLog.count(),
	]);

	return {
		auditLogs,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const getDashboardStats = async () => {
	const [
		totalUsers,
		totalZones,
		totalSchedules,
		totalReports,
		openReports,
		resolvedReports,
	] = await prisma.$transaction([
		prisma.user.count({ where: { deletedAt: null } }),
		prisma.distributionZone.count({ where: { deletedAt: null } }),
		prisma.loadSheddingSchedule.count({ where: { deletedAt: null } }),
		prisma.outageReport.count({ where: { deletedAt: null } }),
		prisma.outageReport.count({
			where: {
				deletedAt: null,
				status: { in: ["REPORTED", "ASSIGNED", "IN_PROGRESS"] },
			},
		}),
		prisma.outageReport.count({
			where: { deletedAt: null, status: "RESOLVED" },
		}),
	]);

	return {
		totalUsers,
		totalZones,
		totalSchedules,
		totalReports,
		openReports,
		resolvedReports,
	};
};

const updateUserRole = async (
	actorId: string,
	targetUserId: string,
	newRole: UpdateUserRoleInput["role"],
) => {
	if (actorId === targetUserId) {
		throw new AppError(400, "Cannot change your own role");
	}

	const result = prisma.$transaction(async (tx) => {
		const targetUser = await tx.user.findFirst({
			where: { id: targetUserId, deletedAt: null },
			select: { id: true, role: true },
		});
		if (!targetUser) {
			throw new AppError(404, "User not found");
		}
		if (targetUser.role === newRole) {
			throw new AppError(400, "User already has this role");
		}

		const updated = await tx.user.updateMany({
			where: { id: targetUserId, deletedAt: null, role: targetUser.role },
			data: { role: newRole },
		});
		if (updated.count === 0) {
			throw new AppError(409, "User role changed; please retry");
		}

		const user = await tx.user.findUniqueOrThrow({
			where: { id: targetUserId },
			select: { id: true, name: true, email: true, role: true },
		});
		await tx.auditLog.create({
			data: {
				actorId,
				action: "USER_ROLE_CHANGED",
				entityType: "USER",
				entityId: targetUserId,
				details: { previousRole: targetUser.role, newRole },
			},
		});

		return user;
	});

	return result;
};

export const AdminService = {
	listUsers,
	listAuditLogs,
	getDashboardStats,
	updateUserRole,
};
