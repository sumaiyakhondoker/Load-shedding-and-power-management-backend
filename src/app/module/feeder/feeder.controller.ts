import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { FeederService } from "./feeder.service";
import {
	feederIdSchema,
	listFeedersSchema,
	type CreateFeederInput,
	type UpdateFeederInput,
} from "./feeder.validation";

const list = catchAsync(async (req, res) => {
	const query = listFeedersSchema.parse(req.query);
	const result = await FeederService.list(query);
	let resMessage: string;
	if (result.meta.total === 0) {
		resMessage = "No feeders found according to your searching.";
	} else if (result.feeders.length === 0) {
		resMessage = "No feeders found on this page. Try an earlier page.";
	} else {
		resMessage = "Feeders retrieved successfully!";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const feeder = await FeederService.create(
		req.user.id,
		req.body as CreateFeederInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Feeder created successfully!",
		data: feeder,
	});
});

const update = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const feederId = feederIdSchema.parse(req.params.id);
	const feeder = await FeederService.update(
		req.user.id,
		feederId,
		req.body as UpdateFeederInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Feeder updated successfully!",
		data: feeder,
	});
});

const remove = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const feederId = feederIdSchema.parse(req.params.id);
	const feeder = await FeederService.remove(req.user.id, feederId);
	sendResponse({
		res,
		statusCode: 200,
		message: "Feeder deleted successfully!",
		data: feeder,
	});
});

export const FeederController: {
	list: RequestHandler;
	create: RequestHandler;
	update: RequestHandler;
	remove: RequestHandler;
} = { list, create, update, remove };
