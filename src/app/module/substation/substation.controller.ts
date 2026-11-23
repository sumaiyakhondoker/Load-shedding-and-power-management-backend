import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { SubstationService } from "./substation.service";
import { listSubstationsSchema, type CreateSubstationInput } from "./substation.validation";

const list = catchAsync(async (req, res) => {
	const query = listSubstationsSchema.parse(req.query);
	const result = await SubstationService.list(query);
	let resMessage: string;
	if (result.meta.total > 0) {
		resMessage = "All substations retrieved successfully!";
	} else {
		resMessage = "No substations found according to your searching.";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const substation = await SubstationService.create(
		req.user.id,
		req.body as CreateSubstationInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Substation created",
		data: substation,
	});
});

export const SubstationController: { list: RequestHandler; create: RequestHandler } = { list, create };
