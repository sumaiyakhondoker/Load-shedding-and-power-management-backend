import { randomUUID } from "node:crypto";
import { Prisma } from "../../../../generated/prisma/client";
import type { UserRole } from "../../../../generated/prisma/enums";
import config from "../../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type {
	CreateBillInput,
	ListBillsQuery,
	UpdateBillInput,
} from "./bill.validation";

const today = () => new Date(new Date().toISOString().slice(0, 10));
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const findActiveTariff = async (tx: Prisma.TransactionClient, id: string) => {
	await tx.$queryRaw`SELECT "id" FROM "electricity_tariffs" WHERE "id" = ${id}::uuid FOR SHARE`;
	const tariff = await tx.electricityTariff.findUnique({ where: { id } });
	if (!tariff) throw new AppError(404, "Tariff not found");
	if (!tariff.isActive) throw new AppError(409, "Tariff is inactive");
	return tariff;
};

const billPeriodConflict = (error: unknown): never => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	)
		throw new AppError(
			409,
			"Bill already exists for this customer and billing period",
		);
	throw error;
};

const payable = (
	previous: string,
	current: string,
	rate: string,
	charges: string,
) => {
	const units = new Prisma.Decimal(current).minus(previous);
	if (units.isNegative())
		throw new AppError(
			400,
			"Current meter reading must be at least the previous reading",
		);
	const price = new Prisma.Decimal(rate);
	if (!price.greaterThan(0))
		throw new AppError(400, "Rate per unit must be positive");
	const total = units
		.mul(price)
		.plus(charges)
		.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
	if (!total.greaterThan(0) || total.greaterThan(999999.99))
		throw new AppError(400, "Total amount is outside the supported range");
	return { consumedUnits: units, totalAmount: total };
};

const refreshOverdueBills = async (customerId?: string) => {
	await prisma.electricityBill.updateMany({
		where: { customerId, status: "UNPAID", dueDate: { lt: today() } },
		data: { status: "OVERDUE" },
	});
};

const create = async (actorId: string, input: CreateBillInput) => {
	const issueDate = date(input.issueDate);
	const dueDate = date(input.dueDate);
	if (dueDate < issueDate)
		throw new AppError(400, "Due date must be on or after issue date");
	const customer = await prisma.user.findFirst({
		where: { id: input.customerId, role: "CUSTOMER", deletedAt: null },
		select: { id: true },
	});
	if (!customer) throw new AppError(404, "Customer not found");
	try {
		return await prisma.$transaction(async (tx) => {
			const tariff = input.tariffId
				? await findActiveTariff(tx, input.tariffId)
				: null;
			const rate = tariff?.ratePerUnit.toString() ?? input.ratePerUnit;
			if (!rate) throw new AppError(400, "A rate is required");
			const currency =
				tariff?.currency ??
				config.stripe_payment_currency?.toUpperCase() ??
				"USD";
			if (!["USD", "BDT"].includes(currency))
				throw new AppError(503, "Billing currency is invalid");
			const { consumedUnits, totalAmount } = payable(
				input.previousMeterReading,
				input.currentMeterReading,
				rate,
				input.additionalCharges,
			);
			const bill = await tx.electricityBill.create({
				data: {
					billNumber: `BILL-${input.billingYear}${String(input.billingMonth).padStart(2, "0")}-${randomUUID()}`,
					customerId: input.customerId,
					tariffId: tariff?.id,
					billingMonth: input.billingMonth,
					billingYear: input.billingYear,
					previousMeterReading: input.previousMeterReading,
					currentMeterReading: input.currentMeterReading,
					consumedUnits,
					ratePerUnit: rate,
					additionalCharges: input.additionalCharges,
					totalAmount,
					currency,
					issueDate,
					dueDate,
					status: dueDate < today() ? "OVERDUE" : "UNPAID",
				},
			});
			await tx.auditLog.create({
				data: {
					actorId,
					action: "BILL_CREATED",
					entityType: "ELECTRICITY_BILL",
					entityId: bill.id,
					details: { billNumber: bill.billNumber },
				},
			});
			return bill;
		});
	} catch (error) {
		return billPeriodConflict(error);
	}
};

const list = async (
	query: ListBillsQuery,
	viewer: { id: string; role: UserRole },
) => {
	await refreshOverdueBills(viewer.role === "CUSTOMER" ? viewer.id : undefined);
	const where: Prisma.ElectricityBillWhereInput = {
		customerId: viewer.role === "CUSTOMER" ? viewer.id : query.customerId,
		tariffId: query.tariffId,
		billingMonth: query.billingMonth,
		billingYear: query.billingYear,
		status: query.status,
		dueDate:
			query.dueFrom || query.dueTo
				? {
						gte: query.dueFrom ? date(query.dueFrom) : undefined,
						lte: query.dueTo ? date(query.dueTo) : undefined,
					}
				: undefined,
		OR:
			query.search && viewer.role === "ADMIN"
				? [
						{ billNumber: { contains: query.search, mode: "insensitive" } },
						{
							customer: {
								name: { contains: query.search, mode: "insensitive" },
							},
						},
						{
							customer: {
								email: { contains: query.search, mode: "insensitive" },
							},
						},
					]
				: undefined,
	};
	const [bills, total] = await prisma.$transaction([
		prisma.electricityBill.findMany({
			where,
			include: { customer: { select: { id: true, name: true, email: true } } },
			orderBy: [{ dueDate: "desc" }, { id: "desc" }],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.electricityBill.count({ where }),
	]);
	return {
		bills,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit),
		},
	};
};

const getById = async (id: string, viewer: { id: string; role: UserRole }) => {
	await refreshOverdueBills(viewer.role === "CUSTOMER" ? viewer.id : undefined);
	const bill = await prisma.electricityBill.findFirst({
		where: {
			id,
			...(viewer.role === "CUSTOMER" ? { customerId: viewer.id } : {}),
		},
		include: {
			payments: {
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				select: {
					id: true,
					status: true,
					amount: true,
					gatewayTransactionId: true,
					createdAt: true,
				},
			},
		},
	});
	if (!bill) throw new AppError(404, "Bill not found");
	return bill;
};

const update = async (actorId: string, id: string, input: UpdateBillInput) => {
	return prisma
		.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT "id" FROM "electricity_bills" WHERE "id" = ${id}::uuid FOR UPDATE`;
			const bill = await tx.electricityBill.findUnique({ where: { id } });
			if (!bill) throw new AppError(404, "Bill not found");
			if (!["UNPAID", "OVERDUE"].includes(bill.status))
				throw new AppError(409, "Bill cannot be edited");
			const active = await tx.payment.count({
				where: { billId: id, status: "PENDING" },
			});
			if (active) throw new AppError(409, "Bill has a pending payment");
			const previous =
				input.previousMeterReading ?? bill.previousMeterReading.toString();
			const current =
				input.currentMeterReading ?? bill.currentMeterReading.toString();
			if (bill.tariffId && input.ratePerUnit !== undefined)
				throw new AppError(
					400,
					"Use tariffId to change the rate of a tariff bill",
				);
			const tariff = input.tariffId
				? await findActiveTariff(tx, input.tariffId)
				: null;
			if (tariff && tariff.currency !== bill.currency)
				throw new AppError(409, "Tariff currency must match the bill currency");
			const rate =
				tariff?.ratePerUnit.toString() ??
				input.ratePerUnit ??
				bill.ratePerUnit.toString();
			const charges =
				input.additionalCharges ?? bill.additionalCharges.toString();
			const dueDate = input.dueDate ? date(input.dueDate) : bill.dueDate;
			const issueDate = input.issueDate
				? date(input.issueDate)
				: bill.issueDate;
			if (dueDate < issueDate)
				throw new AppError(400, "Due date must be on or after issue date");
			const { consumedUnits, totalAmount } = payable(
				previous,
				current,
				rate,
				charges,
			);
			const updated = await tx.electricityBill.updateMany({
				where: { id, status: { in: ["UNPAID", "OVERDUE"] } },
				data: {
					tariffId: tariff?.id,
					billingMonth: input.billingMonth,
					billingYear: input.billingYear,
					issueDate,
					previousMeterReading: previous,
					currentMeterReading: current,
					consumedUnits,
					ratePerUnit: rate,
					additionalCharges: charges,
					totalAmount,
					dueDate,
					status: dueDate < today() ? "OVERDUE" : "UNPAID",
				},
			});
			if (!updated.count) throw new AppError(409, "Bill changed; retry");
			await tx.auditLog.create({
				data: {
					actorId,
					action: "BILL_UPDATED",
					entityType: "ELECTRICITY_BILL",
					entityId: id,
				},
			});
			return tx.electricityBill.findUniqueOrThrow({ where: { id } });
		})
		.catch(billPeriodConflict);
};

const cancel = async (actorId: string, id: string) => {
	return prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT "id" FROM "electricity_bills" WHERE "id" = ${id}::uuid FOR UPDATE`;
		const bill = await tx.electricityBill.findUnique({
			where: { id },
			select: { status: true },
		});
		if (!bill) throw new AppError(404, "Bill not found");
		if (!["UNPAID", "OVERDUE"].includes(bill.status))
			throw new AppError(409, "Bill cannot be cancelled");
		if (await tx.payment.count({ where: { billId: id, status: "PENDING" } }))
			throw new AppError(409, "Bill has a pending payment");
		const result = await tx.electricityBill.updateMany({
			where: { id, status: { in: ["UNPAID", "OVERDUE"] } },
			data: { status: "CANCELLED" },
		});
		if (!result.count) throw new AppError(409, "Bill changed; retry");
		await tx.auditLog.create({
			data: {
				actorId,
				action: "BILL_CANCELLED",
				entityType: "ELECTRICITY_BILL",
				entityId: id,
			},
		});
		return tx.electricityBill.findUniqueOrThrow({ where: { id } });
	});
};

const summary = async (viewer: { id: string; role: UserRole }) => {
	const customerId = viewer.role === "CUSTOMER" ? viewer.id : undefined;
	await refreshOverdueBills(customerId);
	const [billGroups, recentPayments, paymentGroups] = await prisma.$transaction(
		[
			prisma.electricityBill.groupBy({
				by: ["status", "currency"],
				where: { customerId },
				_count: { _all: true },
				_sum: { totalAmount: true },
				orderBy: [{ currency: "asc" }, { status: "asc" }],
			}),
			prisma.payment.findMany({
				where: { userId: customerId },
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
				take: 10,
				select: {
					id: true,
					billId: true,
					amount: true,
					currency: true,
					status: true,
					createdAt: true,
				},
			}),
			prisma.payment.groupBy({
				by: ["status", "currency"],
				where: { userId: customerId },
				_count: { _all: true },
				_sum: { amount: true },
				orderBy: [{ currency: "asc" }, { status: "asc" }],
			}),
		],
		{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
	);
	const byStatus = { UNPAID: 0, OVERDUE: 0, PAID: 0, CANCELLED: 0 };
	const totals = new Map<
		string,
		{
			currency: string;
			outstandingBalance: Prisma.Decimal;
			paidTotal: Prisma.Decimal;
		}
	>();
	const zero = new Prisma.Decimal(0);
	let totalBills = 0;
	for (const group of billGroups) {
		byStatus[group.status] += group._count._all;
		totalBills += group._count._all;
		if (group.status === "CANCELLED") continue;
		const balance = totals.get(group.currency) ?? {
			currency: group.currency,
			outstandingBalance: zero,
			paidTotal: zero,
		};
		const amount = group._sum.totalAmount ?? zero;
		if (group.status === "PAID")
			balance.paidTotal = balance.paidTotal.plus(amount);
		else balance.outstandingBalance = balance.outstandingBalance.plus(amount);
		totals.set(group.currency, balance);
	}
	const balancesByCurrency = [...totals.values()];
	return {
		totalBills,
		byStatus,
		currency:
			balancesByCurrency.length === 1
				? (balancesByCurrency[0]?.currency ?? null)
				: null,
		outstandingBalance:
			balancesByCurrency.length > 1
				? null
				: (balancesByCurrency[0]?.outstandingBalance ?? zero),
		paidTotal:
			balancesByCurrency.length > 1
				? null
				: (balancesByCurrency[0]?.paidTotal ?? zero),
		balancesByCurrency,
		paymentStats: paymentGroups.map((group) => ({
			status: group.status,
			currency: group.currency,
			count: group._count._all,
			amount: group._sum.amount ?? zero,
		})),
		recentPayments,
	};
};

export const BillService = { create, list, getById, update, cancel, summary };
