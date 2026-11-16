import type { RequestHandler } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AdminService } from "./admin.service";
import { listUsersSchema } from "./admin.validation";

const listUsers = catchAsync(async (req, res) => {
  const query = listUsersSchema.parse(req.query);
  const result = await AdminService.listUsers(query);
  sendResponse({ res, statusCode: 200, message: "Users retrieved successfully!!", data: result });
});

export const AdminController: { listUsers: RequestHandler } = { listUsers };
