import Stripe from "stripe";
import { z } from "zod";
import type { Prisma } from "../../../../generated/prisma/client";
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
	amount: true,
	currency: true,
	gateway: true,
	gatewayTransactionId: true,
	status: true,
	purpose: true,
	createdAt: true,
	updatedAt: true,
} as const;

const settingsSchema = z.object({
	secretKey: z.string().startsWith("sk_test_"),
	webhookSecret: z.string().startsWith("whsec_"),
	currency: z.enum(["usd", "bdt"]),
	amount: z
		.string()
		.regex(/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/)
		.refine((value) => Number(value) > 0),
	purpose: z.string().trim().min(1).max(255),
	successUrl: z.url(),
	cancelUrl: z.url(),
});

const getSettings = () => {
	const result = settingsSchema.safeParse({
		secretKey: config.stripe_secret_key,
		webhookSecret: config.stripe_webhook_secret,
		currency: config.stripe_payment_currency?.toLowerCase(),
		amount: config.stripe_payment_amount,
		purpose: config.stripe_payment_purpose,
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

const stripeClient = () => new Stripe(getSettings().secretKey);

const initiate = async (
	userId: string,
	paymentId: string,
	input: InitiatePaymentInput,
) => {
	const settings = getSettings();
	if (input.outageReportId) {
		const report = await prisma.outageReport.findFirst({
			where: {
				id: input.outageReportId,
				reportedById: userId,
				deletedAt: null,
			},
			select: { id: true },
		});
		if (!report) throw new AppError(404, "Outage report not found");
	}

	let payment = await prisma.payment.findUnique({ where: { id: paymentId } });
	if (!payment) {
		try {
			payment = await prisma.payment.create({
				data: {
					id: paymentId,
					userId,
					outageReportId: input.outageReportId,
					amount: settings.amount,
					currency: settings.currency.toUpperCase(),
					gateway: "STRIPE",
					status: "PENDING",
					purpose: settings.purpose,
				},
			});
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!("code" in error) ||
				error.code !== "P2002"
			)
				throw error;
			payment = await prisma.payment.findUnique({ where: { id: paymentId } });
		}
	}
	if (
		!payment ||
		payment.userId !== userId ||
		payment.outageReportId !== (input.outageReportId ?? null)
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
	if (
		!payment.gatewayTransactionId &&
		Date.now() - payment.createdAt.getTime() >= 23 * 60 * 60 * 1000
	) {
		throw new AppError(
			409,
			"Checkout retry window has passed. Use a new idempotency key",
		);
	}

	const stripe = stripeClient();
	let session: Stripe.Checkout.Session;
	try {
		if (payment.gatewayTransactionId) {
			session = await stripe.checkout.sessions.retrieve(
				payment.gatewayTransactionId,
			);
		} else {
			const successUrl = new URL(settings.successUrl);
			successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
			session = await stripe.checkout.sessions.create(
				{
					mode: "payment",
					allowed_payment_method_types: ["card"],
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
			await prisma.payment.updateMany({
				where: {
					id: payment.id,
					gatewayTransactionId: null,
					status: "PENDING",
				},
				data: { gatewayTransactionId: session.id },
			});
		}
	} catch (error) {
		if (error instanceof Stripe.errors.StripeError) {
			throw new AppError(
				502,
				"Stripe Checkout is unavailable. Retry with the same idempotency key",
			);
		}
		throw error;
	}
	if (session.status !== "open" || !session.url) {
		throw new AppError(
			409,
			"Checkout session is no longer open. Use a new idempotency key",
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
	const settings = getSettings();
	if (!Buffer.isBuffer(body) || typeof signature !== "string") {
		throw new AppError(400, "Stripe signature and raw body are required");
	}
	let event: Stripe.Event;
	try {
		event = stripeClient().webhooks.constructEvent(
			body,
			signature,
			settings.webhookSecret,
		);
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
	if (!payment?.gatewayTransactionId) {
		throw new AppError(409, "Payment session is not ready. Retry the webhook");
	}
	if (
		payment.gateway !== "STRIPE" ||
		payment.gatewayTransactionId !== session.id ||
		payment.currency.toLowerCase() !== session.currency ||
		toMinorUnits(payment.amount.toString()) !== session.amount_total
	) {
		throw new AppError(400, "Stripe session does not match the payment");
	}

	let status: "PAID" | "FAILED" | "CANCELLED" | undefined;
	if (
		event.type === "checkout.session.completed" ||
		event.type === "checkout.session.async_payment_succeeded"
	) {
		if (session.payment_status === "paid") status = "PAID";
	} else if (event.type === "checkout.session.async_payment_failed") {
		status = "FAILED";
	} else {
		status = "CANCELLED";
	}
	if (status) {
		await prisma.payment.updateMany({
			where: {
				id: payment.id,
				gatewayTransactionId: session.id,
				status: "PENDING",
			},
			data: { status },
		});
	}
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
		status: query.status,
	};
	const [payments, total] = await prisma.$transaction([
		prisma.payment.findMany({
			where,
			select: paymentSelect,
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.payment.count({ where }),
	]);
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
