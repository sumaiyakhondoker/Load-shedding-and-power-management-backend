import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ScheduleService } from "./schedule.service";
import {
	listSchedulesSchema,
	scheduleIdSchema,
	type CreateScheduleInput,
	type UpdateScheduleInput,
	type UpdateScheduleStatusInput,
} from "./schedule.validation";

const list = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const query = listSchedulesSchema.parse(req.query);
	const result = await ScheduleService.list(query, req.user.role);
	let resMessage: string;
	if (result.meta.total === 0) {
		resMessage = "No schedules found according to your searching.";
	} else if (result.schedules.length === 0) {
		resMessage = "No schedules found on this page. Try an earlier page.";
	} else {
		resMessage = "Schedules retrieved successfully!";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const schedule = await ScheduleService.create(
		req.user.id,
		req.body as CreateScheduleInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Schedule created successfully!",
		data: schedule,
	});
});

const update = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const scheduleId = scheduleIdSchema.parse(req.params.id);
	const schedule = await ScheduleService.update(
		req.user.id,
		scheduleId,
		req.body as UpdateScheduleInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Schedule updated successfully!",
		data: schedule,
	});
});

const updateStatus = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const scheduleId = scheduleIdSchema.parse(req.params.id);
	const schedule = await ScheduleService.updateStatus(
		req.user.id,
		scheduleId,
		req.body as UpdateScheduleStatusInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Schedule status updated successfully!",
		data: schedule,
	});
});

export const ScheduleController: {
	list: RequestHandler;
	create: RequestHandler;
	update: RequestHandler;
	updateStatus: RequestHandler;
} = { list, create, update, updateStatus };
