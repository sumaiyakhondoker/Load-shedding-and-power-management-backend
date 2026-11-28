import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { BillService } from "./bill.service";
import {
	listBillsSchema,
	type CreateBillInput,
	type UpdateBillInput,
} from "./bill.validation";

const viewer = (user: Express.Request["user"]) => {
	if (!user) throw new AppError(401, "Authentication required");
	return user;
};
const id = (value: string | string[] | undefined) => z.uuid().parse(value);

const create = catchAsync(async (req, res) => {
	const bill = await BillService.create(
		viewer(req.user).id,
		req.body as CreateBillInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Bill created successfully",
		data: bill,
	});
});
const list = catchAsync(async (req, res) => {
	const bills = await BillService.list(
		listBillsSchema.parse(req.query),
		viewer(req.user),
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Bills retrieved successfully",
		data: bills,
	});
});
const getById = catchAsync(async (req, res) => {
	const bill = await BillService.getById(id(req.params.id), viewer(req.user));
	sendResponse({
		res,
		statusCode: 200,
		message: "Bill retrieved successfully",
		data: bill,
	});
});
const update = catchAsync(async (req, res) => {
	const bill = await BillService.update(
		viewer(req.user).id,
		id(req.params.id),
		req.body as UpdateBillInput,
	);
	sendResponse({
		res,
		statusCode: 200,
		message: "Bill updated successfully",
		data: bill,
	});
});
const cancel = catchAsync(async (req, res) => {
	const bill = await BillService.cancel(viewer(req.user).id, id(req.params.id));
	sendResponse({
		res,
		statusCode: 200,
		message: "Bill cancelled successfully",
		data: bill,
	});
});
const summary = catchAsync(async (req, res) => {
	const data = await BillService.summary(viewer(req.user));
	sendResponse({
		res,
		statusCode: 200,
		message: "Billing summary retrieved successfully",
		data,
	});
});

export const BillController: Record<
	"create" | "list" | "getById" | "update" | "cancel" | "summary",
	RequestHandler
> = { create, list, getById, update, cancel, summary };
