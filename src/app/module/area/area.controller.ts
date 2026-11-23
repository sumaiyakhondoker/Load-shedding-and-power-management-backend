import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AreaService } from "./area.service";
import type { CreateAreaInput } from "./area.validation";

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const area = await AreaService.create(req.user.id, req.body as CreateAreaInput);
	sendResponse({ res, statusCode: 201, message: "Area created successfully!", data: area });
});

export const AreaController: { create: RequestHandler } = { create };
