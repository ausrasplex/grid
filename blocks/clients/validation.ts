import { z } from "zod";
import { toOptionalAddress } from "@grid/core";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

/** An address in parts ({ street, suburb, state, postcode… }), or one line that's split up. Empty clears it. */
const optAddress = z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional().transform(toOptionalAddress);

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
    address: optAddress,
    abn: optText(40),
    notes: optText(5000),
    /** How they found you (a LeadSource of this business), null for not known; left out keeps it. */
    leadSourceId: z.string().uuid().nullable().optional(),
    /** Referral: the client who referred them; ignored (cleared) for other lead sources. */
    referredByClientId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type ClientInput = z.infer<typeof clientSchema>;

/** Settings › Clients › Lead sources: add one (name), or rename, hide or show one. */
export const leadSourceSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(60).optional(),
    hidden: z.boolean().optional(),
  })
  .strict();

export type LeadSourceInput = z.infer<typeof leadSourceSchema>;

export const businessSchema = z
  .object({
    name: z.string().trim().min(1, "Give the business a name").max(160),
    abn: optText(40),
    email: optEmail,
    phone: optText(40),
    address: optAddress,
    notes: optText(5000),
  })
  .strict();

export type BusinessInput = z.infer<typeof businessSchema>;

// --- export and import ---------------------------------------------------------

/** A zip (the default) carries pictures too; Excel and CSV are the spreadsheet alone. */
export const formatSchema = z.enum(["zip", "xlsx", "csv"]).default("zip");

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
    /** Preview: the names of the pictures in a zip ("pictures/siemens.jpg"). */
    pictureNames: z.array(z.string()).default([]),
    /** Saving: the pictures themselves, base64, by name. */
    pictures: z.record(z.string(), z.string()).default({}),
  })
  .strict();
