import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentService } from "./payment.service";
import {
	idempotencyKeySchema,
	listPaymentsSchema,
	paymentIdSchema,
	type InitiatePaymentInput,
} from "./payment.validation";

const initiate = catchAsync(async (req, res) => {
	if (!req.user) throw new AppError(401, "Authentication required");
	const key = idempotencyKeySchema.parse(req.headers["idempotency-key"]);
	const result = await PaymentService.initiate(
		req.user.id,
		key,
		req.body as InitiatePaymentInput,
	);
	sendResponse({
		res,
		statusCode: 201,
		message: "Checkout session created successfully",
		data: result,
	});
});

const webhook = catchAsync(async (req, res) => {
	await PaymentService.handleWebhook(req.body, req.headers["stripe-signature"]);
	sendResponse({
		res,
		statusCode: 200,
		message: "Webhook received",
		data: null,
	});
});

const getById = catchAsync(async (req, res) => {
	if (!req.user) throw new AppError(401, "Authentication required");
	const id = paymentIdSchema.parse(req.params.id);
	const payment = await PaymentService.getById(id, req.user);
	sendResponse({
		res,
		statusCode: 200,
		message: "Payment retrieved successfully!",
		data: payment,
	});
});

const list = catchAsync(async (req, res) => {
	if (!req.user) throw new AppError(401, "Authentication required");
	const query = listPaymentsSchema.parse(req.query);
	const result = await PaymentService.list(query, req.user);
	sendResponse({
		res,
		statusCode: 200,
		message: "Payments retrieved successfully!",
		data: result,
	});
});

export const PaymentController: {
	initiate: RequestHandler;
	webhook: RequestHandler;
	getById: RequestHandler;
	list: RequestHandler;
} = { initiate, webhook, getById, list };
