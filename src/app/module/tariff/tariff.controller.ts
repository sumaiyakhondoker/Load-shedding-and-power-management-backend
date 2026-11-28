import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { TariffService } from "./tariff.service";
import {
	type CreateTariffInput,
	listTariffsSchema,
	type UpdateTariffInput,
} from "./tariff.validation";

const create = catchAsync(async (req, res) => {
	if (!req.user) throw new AppError(401, "Authentication required");
	const data = await TariffService.create(
		req.user.id,
		req.body as CreateTariffInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Tariff created successfully",
		data,
	});
});

const list = catchAsync(async (req, res) => {
	const { isActive } = listTariffsSchema.parse(req.query);
	const data = await TariffService.list(isActive);
	sendResponse({
		res,
		statusCode: 200,
		message: "Tariffs retrieved successfully",
		data,
	});
});

const getById = catchAsync(async (req, res) => {
	const data = await TariffService.getById(z.uuid().parse(req.params.id));
	sendResponse({
		res,
		statusCode: 200,
		message: "Tariff retrieved successfully",
		data,
	});
});

const update = catchAsync(async (req, res) => {
	if (!req.user) throw new AppError(401, "Authentication required");
	const data = await TariffService.update(
		req.user.id,
		z.uuid().parse(req.params.id),
		req.body as UpdateTariffInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Tariff updated successfully",
		data,
	});
});

export const TariffController: Record<
	"create" | "list" | "getById" | "update",
	RequestHandler
> = {
	create,
	list,
	getById,
	update,
};
