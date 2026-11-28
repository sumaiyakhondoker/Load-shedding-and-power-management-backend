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

type DashboardStats = {
	totalUsers: number;
	totalZones: number;
	totalSchedules: number;
	totalReports: number;
	openReports: number;
	resolvedReports: number;
};

const getDashboardStats = async () => {
	const [stats] = await prisma.$queryRaw<[DashboardStats]>`
		SELECT
			(SELECT count(*) FROM "users" WHERE "deleted_at" IS NULL)::int AS "totalUsers",
			(SELECT count(*) FROM "distribution_zones" WHERE "deleted_at" IS NULL)::int AS "totalZones",
			(SELECT count(*) FROM "load_shedding_schedules" WHERE "deleted_at" IS NULL)::int AS "totalSchedules",
			count(*)::int AS "totalReports",
			(count(*) FILTER (WHERE "status" IN ('REPORTED', 'ASSIGNED', 'IN_PROGRESS')))::int AS "openReports",
			(count(*) FILTER (WHERE "status" = 'RESOLVED'))::int AS "resolvedReports"
		FROM "outage_reports"
		WHERE "deleted_at" IS NULL
	`;
	return stats;
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
