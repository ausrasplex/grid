import { z } from "zod";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const clientSchema = z
  .object({
    name: z.string().trim().min(1, "Give the client a name").max(160),
    contactName: optText(160),
    email: z.union([z.literal(""), z.string().trim().email("Check the email address")]).nullable().optional().transform((value) => (value ? value : null)),
    phone: optText(40),
    address: optText(300),
    abn: optText(40),
    notes: optText(5000),
  })
  .strict();

export type ClientInput = z.infer<typeof clientSchema>;
