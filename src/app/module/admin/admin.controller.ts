import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AdminService } from "./admin.service";
import { listUsersSchema, userIdSchema, type UpdateUserRoleInput } from "./admin.validation";

const listUsers = catchAsync(async (req, res) => {
  const query = listUsersSchema.parse(req.query);
  const result = await AdminService.listUsers(query);
  sendResponse({ res, statusCode: 200, message: "Users retrieved successfully!!", data: result });
});

const updateUserRole = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const targetUserId = userIdSchema.parse(req.params.id);
  const input = req.body as UpdateUserRoleInput;
  const user = await AdminService.updateUserRole(req.user.id, targetUserId, input.role);
  sendResponse({ res, statusCode: 200, message: "User role updated", data: user });
});

export const AdminController: { listUsers: RequestHandler; updateUserRole: RequestHandler } = {
  listUsers,
  updateUserRole,
};
