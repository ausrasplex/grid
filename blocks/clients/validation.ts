import { z } from "zod";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const optEmail = z.union([z.literal(""), z.string().trim().email("Check the email address")]).nullable().optional().transform((value) => (value ? value : null));

export const clientSchema = z
  .object({
    name: z.string().trim().min(1, "Give the client a name").max(160),
    contactName: optText(160),
    /** The business they work for (Honeywell), null for none; left out keeps it. */
    businessId: z.string().uuid().nullable().optional(),
    /** Their role there: "Project Manager". */
    role: optText(100),
    email: optEmail,
    phone: optText(40),
    address: optText(300),
    abn: optText(40),
    notes: optText(5000),
  })
  .strict();

export type ClientInput = z.infer<typeof clientSchema>;

export const businessSchema = z
  .object({
    name: z.string().trim().min(1, "Give the business a name").max(160),
    abn: optText(40),
    email: optEmail,
    phone: optText(40),
    address: optText(300),
    notes: optText(5000),
  })
  .strict();

export type BusinessInput = z.infer<typeof businessSchema>;
