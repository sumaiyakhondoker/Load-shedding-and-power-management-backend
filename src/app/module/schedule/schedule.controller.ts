import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ScheduleService } from "./schedule.service";
import type { CreateScheduleInput } from "./schedule.validation";

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const schedule = await ScheduleService.create(req.user.id, req.body as CreateScheduleInput);
	sendResponse({ res, statusCode: 201, message: "Schedule created successfully!", data: schedule });
});

export const ScheduleController: { create: RequestHandler } = { create };
