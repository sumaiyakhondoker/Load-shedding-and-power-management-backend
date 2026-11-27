import { z } from "zod";
import { PaymentStatus } from "../../../../generated/prisma/enums";

export const initiatePaymentSchema = z.strictObject({
	outageReportId: z.uuid().optional(),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export const idempotencyKeySchema = z.uuid();
export const paymentIdSchema = z.uuid();

export const listPaymentsSchema = z.strictObject({
	page: z.coerce.number().int().min(1).max(100000).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(10),
	status: z.enum(PaymentStatus).optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsSchema>;
