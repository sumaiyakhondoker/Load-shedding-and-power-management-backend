import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DistributionZoneService } from "./distributionZone.service";
import {
	distributionZoneIdSchema,
	listDistributionZonesSchema,
	type CreateDistributionZoneInput,
	type UpdateDistributionZoneInput,
} from "./distributionZone.validation";

const list = catchAsync(async (req, res) => {
	const query = listDistributionZonesSchema.parse(req.query);
	const result = await DistributionZoneService.list(query);
	let resMessage:string;
	if (result.zones.length > 0) {
		// console.log('length: ',result.zones.length);
		resMessage = "Distribution zones retrieved";
	} else {
		resMessage = "No distribution zone found according to your searching.";
	}
	sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const getById = catchAsync(async (req, res) => {
	const zoneId = distributionZoneIdSchema.parse(req.params.id);
	const zone = await DistributionZoneService.getById(zoneId);
	sendResponse({
		res,
		statusCode: 200,
		message: "Distribution zone details retrieved",
		data: zone,
	});
});

const create = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const zone = await DistributionZoneService.create(
		req.user.id,
		req.body as CreateDistributionZoneInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Distribution zone created",
		data: zone,
	});
});

const update = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const zoneId = distributionZoneIdSchema.parse(req.params.id);
	const zone = await DistributionZoneService.update(
		req.user.id,
		zoneId,
		req.body as UpdateDistributionZoneInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Distribution zone updated",
		data: zone,
	});
});

const remove = catchAsync(async (req, res) => {
	if (!req.user) {
		throw new AppError(401, "Authentication required");
	}

	const zoneId = distributionZoneIdSchema.parse(req.params.id);
	const zone = await DistributionZoneService.remove(req.user.id, zoneId);
	sendResponse({
		res,
		statusCode: 200,
		message: "Distribution zone deleted",
		data: zone,
	});
});

export const DistributionZoneController: {
	list: RequestHandler;
	getById: RequestHandler;
	create: RequestHandler;
	update: RequestHandler;
	remove: RequestHandler;
} = {
	list,
	getById,
	create,
	update,
	remove,
};
