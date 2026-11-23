import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { FeederService } from "./feeder.service";
import { listFeedersSchema, type CreateFeederInput } from "./feeder.validation";

const list = catchAsync(async (req, res) => {
	const query = listFeedersSchema.parse(req.query);
	const result = await FeederService.list(query);
	let resMessage: string;
	if (result.meta.total > 0) {
		resMessage = "Feeders retrieved successfully!";
	} else {
		resMessage = "No feeders found according to your searching.";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const feeder = await FeederService.create(req.user.id, req.body as CreateFeederInput);
	sendResponse({ res, statusCode: 201, message: "Feeder created successfully!", data: feeder });
});

export const FeederController: { list: RequestHandler; create: RequestHandler } = { list, create };
