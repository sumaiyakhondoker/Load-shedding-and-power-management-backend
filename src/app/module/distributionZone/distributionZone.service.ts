import { prisma } from "../../lib/prisma";
import type { CreateDistributionZoneInput } from "./distributionZone.validation";

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

export const DistributionZoneService = { create };
