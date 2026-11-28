import { prisma } from "../../lib/prisma";
import type { CreateTariffInput, UpdateTariffInput } from "./tariff.validation";

const create = (actorId: string, input: CreateTariffInput) =>
	prisma.$transaction(async (tx) => {
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
	});

const list = (isActive?: boolean) =>
	prisma.electricityTariff.findMany({
		where: { isActive },
		orderBy: { name: "asc" },
	});

const getById = (id: string) =>
	prisma.electricityTariff.findUniqueOrThrow({ where: { id } });

const update = (actorId: string, id: string, input: UpdateTariffInput) =>
	prisma.$transaction(async (tx) => {
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
	});

export const TariffService = { create, list, getById, update };
