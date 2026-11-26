import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AdminService } from "./admin.service";
import {
	listAuditLogsSchema,
	listUsersSchema,
	userIdSchema,
	type UpdateUserRoleInput,
} from "./admin.validation";

const listAuditLogs = catchAsync(async (req, res) => {
	const query = listAuditLogsSchema.parse(req.query);
	const result = await AdminService.listAuditLogs(query);
	let message: string;
	if (result.meta.total === 0) {
		message = "No audit logs found.";
	} else if (result.auditLogs.length === 0) {
		message = "No audit logs found on this page. Try an earlier page.";
	} else {
		message = "Audit logs retrieved successfully!";
	}
	sendResponse({ res, statusCode: 200, message, data: result });
});

const listUsers = catchAsync(async (req, res) => {
	const query = listUsersSchema.parse(req.query);
	const result = await AdminService.listUsers(query);

	let resMessage: string;
	if (result.meta.total > 0) {
		// console.log('length: ',result.users.length);
		resMessage = "Users retrieved successfully!";
	} else {
		resMessage = "No users found according to your searching.";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const updateUserRole = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const targetUserId = userIdSchema.parse(req.params.id);
	const input = req.body as UpdateUserRoleInput;
	const user = await AdminService.updateUserRole(
		req.user.id,
		targetUserId,
		input.role,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "User role updated successfully!",
		data: user,
	});
});

export const AdminController: {
	listAuditLogs: RequestHandler;
	listUsers: RequestHandler;
	updateUserRole: RequestHandler;
} = {
	listAuditLogs,
	listUsers,
	updateUserRole,
};
