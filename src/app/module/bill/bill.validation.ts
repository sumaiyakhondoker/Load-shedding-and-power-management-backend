import { z } from "zod";
import { BillStatus } from "../../../../generated/prisma/enums";
import { ratePerUnitSchema } from "../tariff/tariff.validation";

const reading = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/);

const money = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);

export const createBillSchema = z
	.strictObject({
		customerId: z.uuid(),
		billingMonth: z.number().int().min(1).max(12),
		billingYear: z.number().int().min(2000).max(9999),
		previousMeterReading: reading,
		currentMeterReading: reading,
		tariffId: z.uuid().optional(),
		ratePerUnit: ratePerUnitSchema.optional(),
		additionalCharges: money.default("0"),
		issueDate: z.iso.date(),
		dueDate: z.iso.date(),
	})
	.refine(
		(value) =>
			(value.tariffId === undefined) !== (value.ratePerUnit === undefined),
		"Supply either tariffId or ratePerUnit",
	);

export const updateBillSchema = z
	.strictObject({
		previousMeterReading: reading.optional(),
		currentMeterReading: reading.optional(),
		tariffId: z.uuid().optional(),
		ratePerUnit: ratePerUnitSchema.optional(),
		billingMonth: z.number().int().min(1).max(12).optional(),
		billingYear: z.number().int().min(2000).max(9999).optional(),
		issueDate: z.iso.date().optional(),
		additionalCharges: money.optional(),
		dueDate: z.iso.date().optional(),
	})
	.refine(
		(value) => Object.keys(value).length > 0,
		"At least one field is required",
	)
	.refine(
		(value) => !value.tariffId || !value.ratePerUnit,
		"Supply either tariffId or ratePerUnit",
	);

export const listBillsSchema = z
	.strictObject({
		page: z.coerce.number().int().min(1).max(100000).default(1),
		limit: z.coerce.number().int().min(1).max(100).default(10),
		customerId: z.uuid().optional(),
		tariffId: z.uuid().optional(),
		billingMonth: z.coerce.number().int().min(1).max(12).optional(),
		billingYear: z.coerce.number().int().min(2000).max(9999).optional(),
		status: z.enum(BillStatus).optional(),
		dueFrom: z.iso.date().optional(),
		dueTo: z.iso.date().optional(),
		search: z.string().trim().min(1).max(100).optional(),
	})
	.refine(
		(value) => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo,
		"dueFrom must be on or before dueTo",
	);

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
export type ListBillsQuery = z.infer<typeof listBillsSchema>;
