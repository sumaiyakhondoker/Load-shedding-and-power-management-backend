import { prisma } from "../../lib/prisma";
import type { CreateDistributionZoneInput, ListDistributionZonesQuery } from "./distributionZone.validation";

const list = async (query: ListDistributionZonesQuery) => {
  const where = {
    deletedAt: null,
    name: query.search ? { contains: query.search, mode: "insensitive" as const } : undefined,
  };

  const [zones, total] = await prisma.$transaction([
    prisma.distributionZone.findMany({
      where,
      select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.distributionZone.count({ where }),
  ]);

  return {
    zones,
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

const create = async (actorId: string, input: CreateDistributionZoneInput) => {
  return prisma.$transaction(async (tx) => {
    const zone = await tx.distributionZone.create({ data: input });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "DISTRIBUTION_ZONE_CREATED",
        entityType: "DISTRIBUTION_ZONE",
        entityId: zone.id,
        details: { name: zone.name },
      },
    });

    return zone;
  });
};

export const DistributionZoneService = { list, create };
