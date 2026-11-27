import bcrypt from "bcrypt";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";
import type { UserRole } from "../../../../generated/prisma/enums";
import config from "../../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { createAccessToken, createRefreshToken } from "../../utils/jwt";
import type { LoginInput, RegisterInput } from "./auth.interface";

const publicUserFields = {
	id: true,
	name: true,
	email: true,
	role: true,
} as const;

const googleClient = new OAuth2Client();
const googleUserFields = { ...publicUserFields, deletedAt: true } as const;
const googleProfileSchema = z.object({
	iss: z.enum(["accounts.google.com", "https://accounts.google.com"]),
	aud: z.union([z.string(), z.array(z.string())]),
	exp: z.number().int().positive(),
	sub: z.string().min(1).max(255),
	email: z.email().max(255),
	email_verified: z.literal(true),
});

const register = async (input: RegisterInput) => {
	const email = input.email.toLowerCase();
	const existingUser = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	if (existingUser) {
		throw new AppError(409, "Email is already registered");
	}

	const saltRounds = Number(config.bcrypt_salt_rounds) || 10;
	const passwordHash = await bcrypt.hash(input.password, saltRounds);
	const user = await prisma.user.create({
		data: {
			name: input.name,
			email,
			passwordHash,
			role: "CUSTOMER",
		},
		select: publicUserFields,
	});

	return {
		user,
		accessToken: createAccessToken(user.id, user.role),
		refreshToken: createRefreshToken(user.id),
	};
};

const login = async (input: LoginInput) => {
	const email = input.email.toLowerCase();
	const user = await prisma.user.findUnique({
		where: { email },
		select: { ...publicUserFields, passwordHash: true, deletedAt: true },
	});

	if (!user || user.deletedAt || !user.passwordHash) {
		throw new AppError(401, "Invalid email or password");
	}

	const passwordMatches = await bcrypt.compare(
		input.password,
		user.passwordHash,
	);
	if (!passwordMatches) {
		throw new AppError(401, "Invalid email or password");
	}

	const publicUser = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	return {
		user: publicUser,
		accessToken: createAccessToken(user.id, user.role),
		refreshToken: createRefreshToken(user.id),
	};
};

const verifyGoogleProfile = async (idToken: string) => {
	if (!config.google_client_id) {
		throw new AppError(503, "Google sign-in is not configured");
	}

	let payload: TokenPayload | undefined;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken,
			audience: config.google_client_id,
		});
		payload = ticket.getPayload();
	} catch {
		throw new AppError(401, "Invalid or expired Google ID token");
	}
	if (!payload) {
		throw new AppError(401, "Invalid or expired Google ID token");
	}

	const profile = googleProfileSchema.safeParse(payload);
	if (!profile.success) {
		throw new AppError(
			401,
			"Google ID token is invalid or email is unverified",
		);
	}
	const audiences = Array.isArray(profile.data.aud)
		? profile.data.aud
		: [profile.data.aud];
	if (
		profile.data.exp <= Date.now() / 1000 ||
		!audiences.includes(config.google_client_id)
	) {
		throw new AppError(401, "Invalid or expired Google ID token");
	}
	const email = profile.data.email.toLowerCase();
	return {
		googleId: profile.data.sub,
		email,
		name:
			payload.name?.trim().slice(0, 255) || email.slice(0, email.indexOf("@")),
	};
};

const googleLogin = async (idToken: string, accountId?: string) => {
	const { googleId, email, name } = await verifyGoogleProfile(idToken);
	const findLinkedUser = () =>
		prisma.user.findUnique({
			where: { googleId },
			select: googleUserFields,
		});

	let user = await findLinkedUser();
	if (!user) {
		try {
			user = accountId
				? await prisma.user.update({
						where: {
							id: accountId,
							email,
							role: "CUSTOMER",
							AND: { googleId: null },
							deletedAt: null,
							passwordHash: { not: null },
						},
						data: { googleId },
						select: googleUserFields,
					})
				: await prisma.user.create({
						data: { email, name, googleId, role: "CUSTOMER" },
						select: googleUserFields,
					});
		} catch (error) {
			if (
				!(error instanceof Prisma.PrismaClientKnownRequestError) ||
				(error.code !== "P2002" && error.code !== "P2025")
			) {
				throw error;
			}
			// A concurrent request may have already saved the same Google account.
			user = await findLinkedUser();
			if (!user) {
				throw new AppError(
					409,
					accountId
						? "Google account cannot be linked to this user"
						: "Email is already registered. Use your existing sign-in method",
				);
			}
		}
	}

	if (user.deletedAt) {
		throw new AppError(401, "Google sign-in is unavailable for this account");
	}
	if (accountId && user.id !== accountId) {
		throw new AppError(409, "Google account is already linked to another user");
	}

	const { deletedAt, ...publicUser } = user;
	return {
		user: publicUser,
		accessToken: createAccessToken(user.id, user.role),
		refreshToken: createRefreshToken(user.id),
	};
};

const refreshToken = async (token: string | undefined) => {
	if (!token) {
		throw new AppError(401, "Refresh token is required");
	}
	if (!config.jwt_refresh_secret) {
		throw new Error("JWT refresh secret is missing");
	}

	let decoded: string | JwtPayload;
	try {
		decoded = jwt.verify(token, config.jwt_refresh_secret, {
			algorithms: ["HS256"],
		});
	} catch {
		throw new AppError(401, "Invalid or expired refresh token");
	}

	const userId = typeof decoded === "string" ? undefined : decoded.userId;
	const tokenType = typeof decoded === "string" ? undefined : decoded.type;
	if (
		tokenType !== "refresh" ||
		typeof userId !== "string" ||
		!z.uuid().safeParse(userId).success
	) {
		throw new AppError(401, "Invalid or expired refresh token");
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, role: true, deletedAt: true },
	});
	if (!user || user.deletedAt) {
		throw new AppError(401, "Authentication required");
	}

	return { accessToken: createAccessToken(user.id, user.role) };
};

const demoLogin = async (role: UserRole) => {
	if (!config.demo_accounts_enabled) {
		throw new AppError(404, "Demo sign-in is disabled");
	}
	const account = {
		ADMIN: config.demo_admin,
		TECHNICIAN: config.demo_technician,
		CUSTOMER: config.demo_customer,
	}[role];
	if (!account.email || !account.password) {
		throw new AppError(503, "Demo sign-in is not configured");
	}

	const user = await prisma.user.findUnique({
		where: { email: account.email },
		select: { ...publicUserFields, deletedAt: true, passwordHash: true },
	});
	if (
		!user ||
		user.deletedAt ||
		user.role !== role ||
		!user.passwordHash ||
		!(await bcrypt.compare(account.password, user.passwordHash))
	) {
		throw new AppError(503, "Demo account is not available");
	}

	await prisma.auditLog.create({
		data: {
			actorId: user.id,
			action: "DEMO_LOGIN",
			entityType: "USER",
			entityId: user.id,
			details: { role, authenticationMethod: "DEMO" },
		},
	});

	const publicUser = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};
	return {
		user: publicUser,
		accessToken: createAccessToken(user.id, user.role),
		refreshToken: createRefreshToken(user.id),
	};
};

export const AuthService = {
	register,
	login,
	googleLogin,
	demoLogin,
	refreshToken,
};
