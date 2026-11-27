import { prisma } from "../src/app/lib/prisma";
import config from "../src/config";
import { seedAdmin, seedDemoUsers } from "../src/app/utils/seed";

try {
  await prisma.$connect();
  if (config.demo_accounts_enabled) {
    await seedDemoUsers();
  } else {
    await seedAdmin();
  }
  console.log("Seeding completed");
} catch {
  console.error("Seeding failed; check database and account configuration.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
