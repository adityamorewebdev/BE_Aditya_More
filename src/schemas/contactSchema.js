import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(100);
const email = z.string().trim().email("Invalid email address");
const subject = z.string().trim().min(1, "Subject is required").max(200);
const message = z.string().trim().min(1, "Message is required").max(2000);

export const createContactSchema = z.object({
  name,
  email,
  subject,
  message,
});

export const replaceContactSchema = createContactSchema;

export const updateContactSchema = z
  .object({ name, email, subject, message })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
