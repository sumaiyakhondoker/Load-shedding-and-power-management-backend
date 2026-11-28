import Stripe from "stripe";
import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";
import type { UserRole } from "../../../../generated/prisma/enums";
import config from "../../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	InitiatePaymentInput,
	ListPaymentsQuery,
} from "./payment.validation";

const paymentSelect = {
	id: true,
	userId: true,
	outageReportId: true,
	billId: true,
	amount: true,
	currency: true,
	gateway: true,
	gatewayTransactionId: true,
	status: true,
	purpose: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.PaymentSelect;

const settingsSchema = z.object({
	secretKey: z.string().regex(/^(sk|rk)_test_\S+$/),
	successUrl: z.url(),
	cancelUrl: z.url(),
});

const getSettings = () => {
	const result = settingsSchema.safeParse({
		secretKey: config.stripe_secret_key,
		successUrl: config.stripe_success_url,
		cancelUrl: config.stripe_cancel_url,
	});
	if (!result.success) {
		throw new AppError(
			503,
			"Stripe Test Mode configuration is incomplete or invalid",
		);
	}
	return result.data;
};

const toMinorUnits = (amount: string) => {
	const [whole, fraction = ""] = amount.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

const stripeClient = (secretKey: string) =>
	new Stripe(secretKey, { timeout: 10_000, maxNetworkRetries: 1 });

const initiate = async (
	userId: string,
	paymentId: string,
	input: InitiatePaymentInput,
) => {
	const settings = getSettings();
	const stripe = stripeClient(settings.secretKey);
	let payment = await prisma.payment.findUnique({ where: { id: paymentId } });
	if (!payment) {
		const pending = await prisma.payment.findFirst({
			where: { billId: input.billId, userId, status: "PENDING" },
		});
		const pendingSessionId = pending?.gatewayTransactionId;
		if (pendingSessionId && pending.id !== paymentId) {
			const session = await stripeRequest(() =>
				stripe.checkout.sessions.retrieve(pendingSessionId),
			);
			await reconcileSession(pending, session);
		}
		try {
			payment = await prisma.$transaction(async (tx) => {
				await tx.$queryRaw`SELECT "id" FROM "electricity_bills" WHERE "id" = ${input.billId}::uuid FOR UPDATE`;
				const bill = await tx.electricityBill.findFirst({
					where: { id: input.billId, customerId: userId },
				});
				if (!bill) throw new AppError(404, "Bill not found");
				const existing = await tx.payment.findUnique({
					where: { id: paymentId },
				});
				if (existing) return existing;
				if (bill.status !== "UNPAID" && bill.status !== "OVERDUE")
					throw new AppError(409, "Bill is not payable");
				if (
					await tx.payment.count({
						where: { billId: bill.id, status: "PENDING" },
					})
				)
					throw new AppError(409, "Bill already has a pending payment");
				return tx.payment.create({
					data: {
						id: paymentId,
						userId,
						billId: bill.id,
						amount: bill.totalAmount,
						currency: bill.currency,
						gateway: "STRIPE",
						status: "PENDING",
						purpose: `Electricity bill ${bill.billNumber}`,
					},
				});
			});
		} catch (error) {
			if (
				!(error instanceof Prisma.PrismaClientKnownRequestError) ||
				error.code !== "P2002"
			)
				throw error;
			payment = await prisma.payment.findUnique({ where: { id: paymentId } });
			if (!payment)
				throw new AppError(409, "Bill already has a pending payment");
		}
	}
	if (
		!payment ||
		payment.userId !== userId ||
		payment.billId !== input.billId
	) {
		throw new AppError(
			409,
			"Idempotency key is already used for another payment",
		);
	}
	if (payment.status !== "PENDING") {
		throw new AppError(
			409,
			"Payment is no longer pending. Use a new idempotency key",
		);
	}
	const bill = await prisma.electricityBill.findUnique({
		where: { id: input.billId },
	});
	if (
		!bill ||
		(bill.status !== "UNPAID" && bill.status !== "OVERDUE") ||
		!bill.totalAmount.equals(payment.amount) ||
		bill.currency !== payment.currency
	) {
		throw new AppError(409, "Bill changed or is no longer payable");
	}
	if (
		!payment.gatewayTransactionId &&
		Date.now() - payment.createdAt.getTime() >= 23 * 60 * 60 * 1000
	) {
		throw new AppError(
			409,
			"Checkout could not be verified within the retry window. Contact support before starting a new payment",
		);
	}

	const session = await stripeRequest(async () => {
		if (payment.gatewayTransactionId) {
			return stripe.checkout.sessions.retrieve(payment.gatewayTransactionId);
		}
		const successUrl = new URL(settings.successUrl);
		successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
		return stripe.checkout.sessions.create(
			{
				mode: "payment",
				allowed_payment_method_types: ["card"],
				adaptive_pricing: { enabled: false },
				integration_identifier: "gridline-bills-vqnsarjl",
				line_items: [
					{
						price_data: {
							currency: payment.currency.toLowerCase(),
							unit_amount: toMinorUnits(payment.amount.toString()),
							product_data: { name: payment.purpose },
						},
						quantity: 1,
					},
				],
				client_reference_id: payment.id,
				metadata: { paymentId: payment.id },
				success_url: successUrl
					.toString()
					.replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}"),
				cancel_url: settings.cancelUrl,
			},
			{ idempotencyKey: payment.id },
		);
	});
	await reconcileSession(payment, session);
	if (session.status !== "open" || !session.url) {
		throw new AppError(
			409,
			session.status === "expired"
				? "Checkout session expired. Use a new idempotency key"
				: "Checkout session is no longer open. Check payment history",
		);
	}

	return {
		paymentId: payment.id,
		checkoutUrl: session.url,
		sessionId: session.id,
	};
};

const handleWebhook = async (
	body: unknown,
	signature: string | string[] | undefined,
) => {
	const webhookSecret = config.stripe_webhook_secret;
	if (!webhookSecret?.startsWith("whsec_"))
		throw new AppError(
			503,
			"Stripe webhook configuration is incomplete or invalid",
		);
	if (!Buffer.isBuffer(body) || typeof signature !== "string") {
		throw new AppError(400, "Stripe signature and raw body are required");
	}
	let event: Stripe.Event;
	try {
		event = Stripe.webhooks.constructEvent(body, signature, webhookSecret);
	} catch {
		throw new AppError(400, "Invalid Stripe webhook signature");
	}
	if (event.livemode)
		throw new AppError(400, "Live Stripe events are not accepted");
	if (
		![
			"checkout.session.completed",
			"checkout.session.async_payment_succeeded",
			"checkout.session.async_payment_failed",
			"checkout.session.expired",
		].includes(event.type)
	)
		return;

	const session = event.data.object as Stripe.Checkout.Session;
	const paymentId = session.metadata?.paymentId;
	if (!paymentId || paymentId !== session.client_reference_id) {
		throw new AppError(400, "Stripe session has no valid payment reference");
	}
	const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
	if (!payment) throw new AppError(404, "Payment not found");
	await reconcileSession(
		payment,
		session,
		event.type === "checkout.session.async_payment_failed",
	);
};

const stripeRequest = async <T>(request: () => Promise<T>): Promise<T> => {
	try {
		return await request();
	} catch (error) {
		if (error instanceof Stripe.errors.StripeError)
			throw new AppError(
				502,
				"Stripe Checkout is unavailable. Retry with the same idempotency key",
			);
		throw error;
	}
};

const reconcileSession = async (
	payment: Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>,
	session: Stripe.Checkout.Session,
	failed = false,
) => {
	if (
		session.livemode ||
		session.mode !== "payment" ||
		session.metadata?.paymentId !== payment.id ||
		session.client_reference_id !== payment.id ||
		payment.gateway !== "STRIPE" ||
		(payment.gatewayTransactionId !== null &&
			payment.gatewayTransactionId !== session.id) ||
		payment.currency.toLowerCase() !== session.currency ||
		toMinorUnits(payment.amount.toString()) !== session.amount_total
	) {
		throw new AppError(400, "Stripe session does not match the payment");
	}
	let status: "PAID" | "FAILED" | "CANCELLED" | undefined;
	if (session.status === "complete" && session.payment_status === "paid")
		status = "PAID";
	else if (session.status === "expired" && session.payment_status === "unpaid")
		status = "CANCELLED";
	else if (failed && session.payment_status === "unpaid") status = "FAILED";

	const billId = payment.billId;
	await prisma.$transaction(async (tx) => {
		if (billId && status) {
			await tx.$queryRaw`SELECT "id" FROM "electricity_bills" WHERE "id" = ${billId}::uuid FOR UPDATE`;
		}
		const updated = await tx.payment.updateMany({
			where: {
				id: payment.id,
				status: "PENDING",
				OR: [
					{ gatewayTransactionId: session.id },
					{ gatewayTransactionId: null },
				],
			},
			data: { status, gatewayTransactionId: session.id },
		});
		if (!updated.count || !billId || status !== "PAID") return;
		const bill = await tx.electricityBill.updateMany({
			where: {
				id: billId,
				customerId: payment.userId,
				status: { in: ["UNPAID", "OVERDUE"] },
				totalAmount: payment.amount,
				currency: payment.currency,
			},
			data: { status: "PAID" },
		});
		if (!bill.count)
			throw new AppError(
				409,
				"Bill could not be marked paid; investigate the payment",
			);
	});
};

type Viewer = { id: string; role: UserRole };

const getById = async (id: string, viewer: Viewer) => {
	const payment = await prisma.payment.findFirst({
		where: { id, ...(viewer.role === "CUSTOMER" ? { userId: viewer.id } : {}) },
		select: paymentSelect,
	});
	if (!payment) throw new AppError(404, "Payment not found");
	return payment;
};

const list = async (query: ListPaymentsQuery, viewer: Viewer) => {
	const where: Prisma.PaymentWhereInput = {
		...(viewer.role === "CUSTOMER" ? { userId: viewer.id } : {}),
		...(query.status !== undefined ? { status: query.status } : {}),
		...(query.billId !== undefined ? { billId: query.billId } : {}),
	};
	const [payments, total] = await prisma.$transaction(
		[
			prisma.payment.findMany({
				where,
				select: paymentSelect,
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				skip: (query.page - 1) * query.limit,
				take: query.limit,
			}),
			prisma.payment.count({ where }),
		],
		{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
	);
	return {
		payments,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

export const PaymentService = { initiate, handleWebhook, getById, list };
