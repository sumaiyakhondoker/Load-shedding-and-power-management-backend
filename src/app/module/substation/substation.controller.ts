import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { SubstationService } from "./substation.service";
import type { CreateSubstationInput } from "./substation.validation";

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

export const SubstationController: { create: RequestHandler } = { create };
