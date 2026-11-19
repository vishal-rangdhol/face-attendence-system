import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().min(1),
  type: z.literal("user").default("user"),
  name: z.string().min(1, "Name is required").max(100),
  timezone: z.string().default("UTC"),
  hasBiometrics: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserDocument = z.infer<typeof UserSchema>;

export const RegisterUserRequestSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(100),
  timezone: z.string().optional().default("UTC"),
});

export type RegisterUserRequest = z.infer<typeof RegisterUserRequestSchema>;
