import bcrypt from "bcrypt";
import { Prisma } from "../../../generated/prisma/client";
import { UserRole } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../lib/prisma";

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
			select: {
				id: true,
				name: true,
				role: true,
				deletedAt: true,
				passwordHash: true,
			},
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
				select: {
					id: true,
					name: true,
					role: true,
					deletedAt: true,
					passwordHash: true,
				},
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

export const seedDemoUsers = async () => {
	if (!config.demo_accounts_enabled) return;

	await Promise.all([
		ensureDemoUser(UserRole.ADMIN, config.demo_admin),
		ensureDemoUser(UserRole.TECHNICIAN, config.demo_technician),
		ensureDemoUser(UserRole.CUSTOMER, config.demo_customer),
	]);
};
