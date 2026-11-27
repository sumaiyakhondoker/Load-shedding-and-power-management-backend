import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import config from "../../config";

const adapter = new PrismaPg({
	connectionString: config.database_url,
	max: 2,
	idleTimeoutMillis: 10_000,
});

export const prisma = new PrismaClient({ adapter });
