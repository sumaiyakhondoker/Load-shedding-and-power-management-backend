import bcrypt from "bcrypt";
import { Prisma } from "../../../generated/prisma/client";
import { UserRole } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../lib/prisma";

const demoIds = {
	zone: "c2dfe09b-2aa4-49d4-8e42-3ef15715a001",
	substation: "c2dfe09b-2aa4-49d4-8e42-3ef15715a002",
	feeder: "c2dfe09b-2aa4-49d4-8e42-3ef15715a003",
	area: "c2dfe09b-2aa4-49d4-8e42-3ef15715a004",
	schedule: "c2dfe09b-2aa4-49d4-8e42-3ef15715a005",
	outage: "c2dfe09b-2aa4-49d4-8e42-3ef15715a006",
	payment: "c2dfe09b-2aa4-49d4-8e42-3ef15715a007",
};

const saltRounds = () => Number(config.bcrypt_salt_rounds) || 10;

export const seedAdmin = async () => {
	const name = config.admin_name?.trim();
	const email = config.admin_email?.trim().toLowerCase();
	const password = config.admin_password;

	if (!name || !email || !password) {
		throw new Error("Admin name, email, or password is missing in .env");
	}

	const existingUser = await prisma.user.findUnique({
		where: { email },
		select: { role: true, deletedAt: true },
	});

	if (existingUser) {
		if (existingUser.role !== UserRole.ADMIN || existingUser.deletedAt) {
			throw new Error("Admin email is already used by another account");
		}
		return;
	}

	const passwordHash = await bcrypt.hash(password, saltRounds());
	await prisma.user.create({
		data: { name, email, passwordHash, role: UserRole.ADMIN },
	});

	console.log("Admin account created.");
};

const ensureDemoUser = async (
	role: UserRole,
	account: { email: string | undefined; password: string | undefined },
) => {
	const email = account.email?.trim().toLowerCase();
	const password = account.password;
	if (!email || !password || password.length < 12) {
		throw new Error(`Demo ${role} email or password is missing or invalid`);
	}

	const find = () =>
		prisma.user.findUnique({
			where: { email },
			select: { id: true, role: true, deletedAt: true, passwordHash: true },
		});
	let existing = await find();
	if (!existing) {
		const passwordHash = await bcrypt.hash(password, saltRounds());
		try {
			existing = await prisma.user.create({
				data: {
					name: `Demo ${role.toLowerCase()}`,
					email,
					passwordHash,
					role,
				},
				select: { id: true, role: true, deletedAt: true, passwordHash: true },
			});
		} catch (error) {
			if (
				!(error instanceof Prisma.PrismaClientKnownRequestError) ||
				error.code !== "P2002"
			) {
				throw error;
			}
			existing = await find();
		}
	}

	if (
		!existing ||
		existing.role !== role ||
		existing.deletedAt ||
		!existing.passwordHash
	) {
		throw new Error(`Demo ${role} email is unavailable for the expected role`);
	}
	if (!(await bcrypt.compare(password, existing.passwordHash))) {
		throw new Error(`Demo ${role} email belongs to an existing account`);
	}
	return existing.id;
};

const seedDemoSampleData = async (users: {
	adminId: string;
	technicianId: string;
	customerId: string;
}) => {
	const now = new Date();
	await prisma.$transaction(async (tx) => {
		await tx.distributionZone.upsert({
			where: { id: demoIds.zone },
			create: {
				id: demoIds.zone,
				name: "Assessment North Zone",
				description:
					"Synthetic assessment records; no live infrastructure data.",
			},
			update: {
				name: "Assessment North Zone",
				description:
					"Synthetic assessment records; no live infrastructure data.",
				deletedAt: null,
			},
		});
		await tx.substation.upsert({
			where: { id: demoIds.substation },
			create: {
				id: demoIds.substation,
				zoneId: demoIds.zone,
				name: "Assessment Substation",
				code: "ASSESSMENT-SS-01",
			},
			update: {
				zoneId: demoIds.zone,
				name: "Assessment Substation",
				code: "ASSESSMENT-SS-01",
				deletedAt: null,
			},
		});
		await tx.feeder.upsert({
			where: { id: demoIds.feeder },
			create: {
				id: demoIds.feeder,
				substationId: demoIds.substation,
				name: "Assessment Feeder",
				code: "ASSESSMENT-FDR-01",
			},
			update: {
				substationId: demoIds.substation,
				name: "Assessment Feeder",
				code: "ASSESSMENT-FDR-01",
				deletedAt: null,
			},
		});
		await tx.area.upsert({
			where: { id: demoIds.area },
			create: {
				id: demoIds.area,
				feederId: demoIds.feeder,
				name: "Assessment Sample Area",
				address: "Synthetic sample location",
			},
			update: {
				feederId: demoIds.feeder,
				name: "Assessment Sample Area",
				address: "Synthetic sample location",
				deletedAt: null,
			},
		});
		await tx.loadSheddingSchedule.upsert({
			where: { id: demoIds.schedule },
			create: {
				id: demoIds.schedule,
				areaId: demoIds.area,
				createdById: users.adminId,
				title: "Assessment Sample Schedule",
				reason: "Synthetic schedule for role workflow assessment.",
				startsAt: new Date(now.getTime() - 15 * 60 * 1000),
				endsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
				status: "PUBLISHED",
			},
			update: {
				areaId: demoIds.area,
				createdById: users.adminId,
				title: "Assessment Sample Schedule",
				reason: "Synthetic schedule for role workflow assessment.",
				startsAt: new Date(now.getTime() - 15 * 60 * 1000),
				endsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
				status: "PUBLISHED",
				deletedAt: null,
			},
		});
		await tx.outageReport.upsert({
			where: { id: demoIds.outage },
			create: {
				id: demoIds.outage,
				areaId: demoIds.area,
				reportedById: users.customerId,
				assignedTechnicianId: users.technicianId,
				title: "Assessment Sample Outage",
				description: "Synthetic sample outage report for technician workflow.",
				status: "ASSIGNED",
				priority: "MEDIUM",
				reportedAt: now,
				assignedAt: now,
			},
			update: {
				areaId: demoIds.area,
				reportedById: users.customerId,
				assignedTechnicianId: users.technicianId,
				title: "Assessment Sample Outage",
				description: "Synthetic sample outage report for technician workflow.",
				status: "ASSIGNED",
				priority: "MEDIUM",
				reportedAt: now,
				assignedAt: now,
				resolvedAt: null,
				resolutionNote: null,
				deletedAt: null,
			},
		});
		await tx.payment.upsert({
			where: { id: demoIds.payment },
			create: {
				id: demoIds.payment,
				userId: users.customerId,
				outageReportId: demoIds.outage,
				amount: "0.01",
				currency: "BDT",
				gateway: "BKASH",
				status: "PAID",
				purpose: "Assessment-only synthetic payment",
			},
			update: {
				userId: users.customerId,
				outageReportId: demoIds.outage,
				amount: "0.01",
				currency: "BDT",
				gateway: "BKASH",
				status: "PAID",
				purpose: "Assessment-only synthetic payment",
			},
		});
	});
};

export const seedDemoUsers = async () => {
	if (!config.demo_accounts_enabled) return;

	const [adminId, technicianId, customerId] = await Promise.all([
		ensureDemoUser(UserRole.ADMIN, config.demo_admin),
		ensureDemoUser(UserRole.TECHNICIAN, config.demo_technician),
		ensureDemoUser(UserRole.CUSTOMER, config.demo_customer),
	]);
	await seedDemoSampleData({ adminId, technicianId, customerId });
};
