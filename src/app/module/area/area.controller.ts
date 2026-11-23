import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AreaService } from "./area.service";
import { areaIdSchema, listAreasSchema, type CreateAreaInput, type UpdateAreaInput } from "./area.validation";

const list = catchAsync(async (req, res) => {
	const query = listAreasSchema.parse(req.query);
	const result = await AreaService.list(query);
	let resMessage: string;
	if (result.meta.total > 0) {
		resMessage = "Areas retrieved successfully!";
	} else {
		resMessage = "No areas found according to your searching.";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const getById = catchAsync(async (req, res) => {
	const areaId = areaIdSchema.parse(req.params.id);
	const area = await AreaService.getById(areaId);
	sendResponse({ res, statusCode: 200, message: "Area details retrieved successfully!", data: area });
});

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const area = await AreaService.create(req.user.id, req.body as CreateAreaInput);
	sendResponse({ res, statusCode: 201, message: "Area created successfully!", data: area });
});

const update = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const areaId = areaIdSchema.parse(req.params.id);
	const area = await AreaService.update(req.user.id, areaId, req.body as UpdateAreaInput);
	sendResponse({ res, statusCode: 200, message: "Area updated successfully!", data: area });
});

export const AreaController: { list: RequestHandler; getById: RequestHandler; create: RequestHandler; update: RequestHandler } = { list, getById, create, update };
