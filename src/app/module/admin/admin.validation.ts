import { z } from "zod";
import { UserRole } from "../../../../generated/prisma/enums";

export const listUsersSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    role: z.enum(UserRole).optional(),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersSchema>;

export const userIdSchema = z.uuid();

export const updateUserRoleSchema = z.object({
  role: z.enum(UserRole),
}).strict();

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
