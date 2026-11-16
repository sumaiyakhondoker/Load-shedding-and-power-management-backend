import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";

const getMe = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      areaId: true,
      createdAt: true,
    }
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  return user;
};

export const UserService = { getMe };
