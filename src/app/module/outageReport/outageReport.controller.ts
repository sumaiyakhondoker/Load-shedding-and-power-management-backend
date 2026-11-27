import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { OutageReportService } from "./outageReport.service";
import {
	listOutageReportsSchema,
	outageReportIdSchema,
	type AssignOutageReportInput,
	type CreateOutageReportInput,
	type UpdateOutageReportStatusInput,
} from "./outageReport.validation";

const list = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const query = listOutageReportsSchema.parse(req.query);
	const result = await OutageReportService.list(query, req.user);
	let message: string;
	if (result.meta.total === 0) {
		message =
			"No outage reports found for your search. Search by report title or description.";
	} else if (result.reports.length === 0) {
		message = "No outage reports found on this page. Try an earlier page.";
	} else {
		message = "Outage reports retrieved successfully!";
	}
	sendResponse({ res, statusCode: 200, message, data: result });
});

const getById = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const reportId = outageReportIdSchema.parse(req.params.id);
	const report = await OutageReportService.getById(reportId, req.user);
	sendResponse({
		res,
		statusCode: 200,
		message: "Outage report details retrieved successfully!",
		data: report,
	});
});

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

const assign = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const reportId = outageReportIdSchema.parse(req.params.id);
	const report = await OutageReportService.assign(
		req.user.id,
		reportId,
		req.body as AssignOutageReportInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Outage report assigned successfully!",
		data: report,
	});
});

const updateStatus = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const reportId = outageReportIdSchema.parse(req.params.id);
	const report = await OutageReportService.updateStatus(
		req.user,
		reportId,
		req.body as UpdateOutageReportStatusInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Outage report status updated successfully!",
		data: report,
	});
});

export const OutageReportController: {
	list: RequestHandler;
	getById: RequestHandler;
	create: RequestHandler;
	assign: RequestHandler;
	updateStatus: RequestHandler;
} = { list, getById, create, assign, updateStatus };
