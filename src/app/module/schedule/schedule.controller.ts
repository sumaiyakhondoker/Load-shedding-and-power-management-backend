import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ScheduleService } from "./schedule.service";
import { listSchedulesSchema, type CreateScheduleInput } from "./schedule.validation";

const list = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const query = listSchedulesSchema.parse(req.query);
	const result = await ScheduleService.list(query, req.user.role);
	let resMessage: string;
	if (result.meta.total > 0) {
		resMessage = "Schedules retrieved successfully!";
	} else {
		resMessage = "No schedules found according to your searching.";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const schedule = await ScheduleService.create(req.user.id, req.body as CreateScheduleInput);
	sendResponse({ res, statusCode: 201, message: "Schedule created successfully!", data: schedule });
});

export const ScheduleController: { list: RequestHandler; create: RequestHandler } = { list, create };
