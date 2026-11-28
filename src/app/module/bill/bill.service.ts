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

export const refreshOverdueBills = async () => {
	await prisma.electricityBill.updateMany({
		where: { status: "UNPAID", dueDate: { lt: today() } },
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
	const { consumedUnits, totalAmount } = payable(
		input.previousMeterReading,
		input.currentMeterReading,
		input.ratePerUnit,
		input.additionalCharges,
	);
	const currency = config.stripe_payment_currency?.toUpperCase() ?? "USD";
	if (!["USD", "BDT"].includes(currency))
		throw new AppError(503, "Billing currency is invalid");
	try {
		return await prisma.$transaction(async (tx) => {
			const bill = await tx.electricityBill.create({
				data: {
					billNumber: `BILL-${input.billingYear}${String(input.billingMonth).padStart(2, "0")}-${randomUUID()}`,
					customerId: input.customerId,
					billingMonth: input.billingMonth,
					billingYear: input.billingYear,
					previousMeterReading: input.previousMeterReading,
					currentMeterReading: input.currentMeterReading,
					consumedUnits,
					ratePerUnit: input.ratePerUnit,
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
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		)
			throw new AppError(
				409,
				"Bill already exists for this customer and billing period",
			);
		throw error;
	}
};

const list = async (
	query: ListBillsQuery,
	viewer: { id: string; role: UserRole },
) => {
	await refreshOverdueBills();
	const where: Prisma.ElectricityBillWhereInput = {
		customerId: viewer.role === "CUSTOMER" ? viewer.id : query.customerId,
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
	await refreshOverdueBills();
	const bill = await prisma.electricityBill.findFirst({
		where: {
			id,
			...(viewer.role === "CUSTOMER" ? { customerId: viewer.id } : {}),
		},
		include: {
			payments: {
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
	await refreshOverdueBills();
	return prisma.$transaction(async (tx) => {
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
		const rate = input.ratePerUnit ?? bill.ratePerUnit.toString();
		const charges =
			input.additionalCharges ?? bill.additionalCharges.toString();
		const dueDate = input.dueDate ? date(input.dueDate) : bill.dueDate;
		if (dueDate < bill.issueDate)
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
	});
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
	await refreshOverdueBills();
	const where = viewer.role === "CUSTOMER" ? { customerId: viewer.id } : {};
	const [bills, recentPayments, paymentGroups] = await prisma.$transaction([
		prisma.electricityBill.findMany({
			where,
			select: { status: true, totalAmount: true },
		}),
		prisma.payment.findMany({
			where: viewer.role === "CUSTOMER" ? { userId: viewer.id } : {},
			orderBy: { createdAt: "desc" },
			take: 10,
			select: {
				id: true,
				billId: true,
				amount: true,
				status: true,
				createdAt: true,
			},
		}),
		prisma.payment.groupBy({
			by: ["status"],
			where: viewer.role === "CUSTOMER" ? { userId: viewer.id } : {},
			_count: { _all: true },
			_sum: { amount: true },
		}),
	]);
	const byStatus = { UNPAID: 0, OVERDUE: 0, PAID: 0, CANCELLED: 0 };
	let outstanding = new Prisma.Decimal(0);
	let paidTotal = new Prisma.Decimal(0);
	for (const bill of bills) {
		byStatus[bill.status]++;
		if (bill.status === "UNPAID" || bill.status === "OVERDUE")
			outstanding = outstanding.plus(bill.totalAmount);
		if (bill.status === "PAID") paidTotal = paidTotal.plus(bill.totalAmount);
	}
	return {
		totalBills: bills.length,
		byStatus,
		outstandingBalance: outstanding,
		paidTotal,
		paymentStats: paymentGroups.map((group) => ({
			status: group.status,
			count: group._count._all,
			amount: group._sum.amount ?? new Prisma.Decimal(0),
		})),
		recentPayments,
	};
};

export const BillService = { create, list, getById, update, cancel, summary };
