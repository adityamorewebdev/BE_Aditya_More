import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .transform((value) => value.toLowerCase());
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
