import bcrypt from "bcrypt";
import config from "../../../config";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { createAccessToken } from "../../utils/jwt";
import type { RegisterInput } from "./auth.interface";

const publicUserFields = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

const register = async (input: RegisterInput) => {
  const email = input.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existingUser) {
    throw new AppError(409, "Email is already registered");
  }

  const saltRounds = Number(config.bcrypt_salt_rounds) || 10;
  const passwordHash = await bcrypt.hash(input.password, saltRounds);
  const user = await prisma.user.create({
    data: { name: input.name, email, passwordHash },
    select: publicUserFields,
  });

  return { user, accessToken: createAccessToken(user.id, user.role) };
};

export const AuthService = { register };
