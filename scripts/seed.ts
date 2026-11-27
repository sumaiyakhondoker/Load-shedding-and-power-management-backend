import { prisma } from "../src/app/lib/prisma";
import { seedAdmin, seedDemoUsers } from "../src/app/utils/seed";

try {
  await prisma.$connect();
  await seedAdmin();
  await seedDemoUsers();
  console.log("Seeding completed");
} catch {
  console.error("Seeding failed; check database and account configuration.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
