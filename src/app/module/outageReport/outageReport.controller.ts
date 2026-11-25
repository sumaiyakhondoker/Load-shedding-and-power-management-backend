import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { OutageReportService } from "./outageReport.service";
import type { CreateOutageReportInput } from "./outageReport.validation";

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const report = await OutageReportService.create(
		req.user.id,
		req.body as CreateOutageReportInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Outage report created successfully!",
		data: report,
	});
});

export const OutageReportController: { create: RequestHandler } = { create };
