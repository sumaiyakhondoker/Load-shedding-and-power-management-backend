import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { FeederService } from "./feeder.service";
import type { CreateFeederInput } from "./feeder.validation";

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const feeder = await FeederService.create(req.user.id, req.body as CreateFeederInput);
	sendResponse({ res, statusCode: 201, message: "Feeder created successfully!!", data: feeder });
});

export const FeederController: { create: RequestHandler } = { create };
