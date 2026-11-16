import type { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { ListUsersQuery } from "./admin.validation";

const listUsers = async (query: ListUsersQuery) => {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    role: query.role,
    OR: query.search
      ? [
          { name: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
        ]
      : undefined,
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        areaId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

export const AdminService = { listUsers };
