import bcrypt from "bcrypt";
import { UserRole } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../lib/prisma";

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

  const saltRounds = Number(config.bcrypt_salt_rounds) || 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await prisma.user.create({
    data: { name, email, passwordHash, role: UserRole.ADMIN },
  });

  console.log("Admin account created.");
};
