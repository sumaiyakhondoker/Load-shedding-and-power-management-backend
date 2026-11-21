import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { UpdateProfileInput } from "./user.validation";

const profileSelect = {
	id: true,
	name: true,
	email: true,
	role: true,
	phone: true,
	areaId: true,
	createdAt: true,
} as const;

const getMe = async (userId: string) => {
	const user = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
		select: profileSelect,
	});

	if (!user) {
		throw new AppError(404, "User not found");
	}

	return user;
};

const updateMe = async (userId: string, input: UpdateProfileInput) => {
	const existingUser = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
		select: { id: true },
	});
	if (!existingUser) {
		throw new AppError(404, "User not found");
	}

	if (input.areaId) {
		const area = await prisma.area.findFirst({
			where: { id: input.areaId, deletedAt: null },
			select: { id: true },
		});
		if (!area) {
			throw new AppError(404, "Area not found");
		}
	}

	return prisma.user.update({
		where: { id: userId },
		data: input,
		select: profileSelect,
	});
};

export const UserService = { getMe, updateMe };
