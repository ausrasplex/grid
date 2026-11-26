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

// --- export and import ---------------------------------------------------------

export const formatSchema = z.enum(["xlsx", "csv"]).default("xlsx");

/** Share our card: `members` is a comma-separated list of membership ids (none = just the business). */
export const cardQuerySchema = z.object({
  format: formatSchema,
  members: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").filter(Boolean) : []))
    .pipe(z.array(z.string().uuid())),
});

const decision = z.enum(["add", "update", "skip"]);

export const importSchema = z
  .object({
    /** The first sheet of the file, row by row, as read on the phone or computer. */
    cells: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    decisions: z
      .object({ businesses: z.record(z.string(), decision), people: z.record(z.string(), decision) })
      .default({ businesses: {}, people: {} }),
  })
  .strict();
