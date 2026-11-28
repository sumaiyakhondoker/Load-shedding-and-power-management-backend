import { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { CreateTariffInput, UpdateTariffInput } from "./tariff.validation";

const handleTariffError = (error: unknown): never => {
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2002")
			throw new AppError(409, "A tariff with this name already exists");
		if (error.code === "P2025") throw new AppError(404, "Tariff not found");
	}
	throw error;
};

const create = (actorId: string, input: CreateTariffInput) =>
	prisma
		.$transaction(async (tx) => {
			const tariff = await tx.electricityTariff.create({ data: input });
			await tx.auditLog.create({
				data: {
					actorId,
					action: "TARIFF_CREATED",
					entityType: "ELECTRICITY_TARIFF",
					entityId: tariff.id,
				},
			});
			return tariff;
		})
		.catch(handleTariffError);

const list = (isActive?: boolean) =>
	prisma.electricityTariff.findMany({
		where: { isActive },
		orderBy: { name: "asc" },
	});

const getById = async (id: string) => {
	const tariff = await prisma.electricityTariff.findUnique({ where: { id } });
	if (!tariff) throw new AppError(404, "Tariff not found");
	return tariff;
};

const update = (actorId: string, id: string, input: UpdateTariffInput) =>
	prisma
		.$transaction(async (tx) => {
			const tariff = await tx.electricityTariff.update({
				where: { id },
				data: input,
			});
			await tx.auditLog.create({
				data: {
					actorId,
					action: "TARIFF_UPDATED",
					entityType: "ELECTRICITY_TARIFF",
					entityId: id,
					details: input,
				},
			});
			return tariff;
		})
		.catch(handleTariffError);

export const TariffService = { create, list, getById, update };
