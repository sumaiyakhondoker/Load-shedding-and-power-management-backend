import { z } from "zod";

export const ratePerUnitSchema = z
	.string()
	.regex(/^(0|[1-9]\d{0,7})(\.\d{1,4})?$/)
	.refine((value) => Number(value) > 0, "Rate per unit must be positive");

const tariffFields = {
	name: z.string().trim().min(1).max(120),
	ratePerUnit: ratePerUnitSchema,
	isActive: z.boolean(),
};

export const createTariffSchema = z.strictObject({
	...tariffFields,
	currency: z.enum(["USD", "BDT"]),
	isActive: tariffFields.isActive.default(true),
});

export const updateTariffSchema = z
	.strictObject(tariffFields)
	.partial()
	.refine(
		(value) => Object.keys(value).length > 0,
		"At least one field is required",
	);

export const listTariffsSchema = z.strictObject({
	isActive: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.optional(),
});

export type CreateTariffInput = z.infer<typeof createTariffSchema>;
export type UpdateTariffInput = z.infer<typeof updateTariffSchema>;
