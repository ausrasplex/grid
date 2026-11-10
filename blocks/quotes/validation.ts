import { z } from "zod";

const uuid = z.string().uuid();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));
/** Dollars as a number with up to 2 decimals (the form sends numbers). */
const money = z.number().min(-1_000_000_000).max(1_000_000_000);

export const taxSettingsSchema = z
  .object({
    taxName: z.string().trim().min(1).max(30),
    pricesIncludeTax: z.boolean(),
    registrationLabel: z.string().trim().max(30),
    currency: z.string().trim().length(3).toUpperCase(),
    locale: z.string().trim().min(2).max(20),
    rounding: z.enum(["LINE", "TOTAL"]),
    documentTitle: z.string().trim().min(1).max(40),
    defaultTaxCodeId: uuid.nullable(),
    quotePrefix: z.string().trim().max(10),
    validityDays: z.number().int().min(1).max(365),
    defaultTerms: optText(10000),
    onlineAccept: z.boolean(),
    signDrawn: z.boolean(),
    signTyped: z.boolean(),
  })
  .strict()
  .refine((value) => !value.onlineAccept || value.signDrawn || value.signTyped, "Allow drawing or typing a signature (or both)");

export const taxCodeSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    label: z.string().trim().min(1).max(20),
    /** Percent, e.g. 10 */
    ratePct: z.number().min(0).max(100),
    active: z.boolean().default(true),
  })
  .strict();

export const clientSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    contactName: optText(160),
    email: z.union([z.literal(""), z.string().trim().email("Check the email address")]).nullable().optional().transform((value) => (value ? value : null)),
    phone: optText(40),
    address: optText(300),
    abn: optText(40),
    notes: optText(5000),
  })
  .strict();

export const priceItemSchema = z
  .object({
    kind: z.enum(["LABOUR", "MATERIAL"]),
    name: z.string().trim().min(1).max(200),
    unit: z.string().trim().min(1).max(20),
    cost: money.nullable(),
    sell: money,
    taxCodeId: uuid.nullable(),
    supplier: optText(100),
    supplierCode: optText(100),
    favourite: z.boolean().default(false),
  })
  .strict();

export const createQuoteSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    clientId: uuid.nullable().optional(),
    siteAddress: optText(300),
    projectId: uuid.nullable().optional(),
  })
  .strict();

export const lineSchema = z
  .object({
    section: optText(100),
    priceItemId: uuid.nullable().optional(),
    description: z.string().trim().min(1).max(2000),
    qty: z.number().min(-1_000_000).max(1_000_000),
    unit: z.string().trim().min(1).max(20),
    cost: money.nullable().optional(),
    sell: money,
    taxCodeId: uuid.nullable(),
    optional: z.boolean().default(false),
  })
  .strict();

export const updateQuoteSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    clientId: uuid.nullable(),
    siteAddress: optText(300),
    clientView: z.enum(["ITEMISED", "SECTIONS", "LUMP"]),
    pricesIncludeTax: z.boolean(),
    validUntil: z.coerce.date(),
    intro: optText(10000),
    terms: optText(20000),
    internalNotes: optText(10000),
    lines: z.array(lineSchema).max(500),
  })
  .partial()
  .strict();

export const sendSchema = z
  .object({
    /** "email": Grid emails it. "manual": you send the PDF yourself. */
    how: z.enum(["email", "manual"]),
    to: z.string().trim().email("Check the email address").optional(),
    message: z.string().trim().max(5000).optional(),
  })
  .strict()
  .refine((value) => value.how === "manual" || !!value.to, "Who should it go to?");

export const acceptSchema = z
  .object({
    note: z.string().trim().max(2000).optional(),
    /** Make a job from it (needs a site address). */
    createJob: z.boolean().default(true),
  })
  .strict();

export const declineSchema = z.object({ reason: z.string().trim().max(2000).optional() }).strict();

export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;
export type TaxCodeInput = z.infer<typeof taxCodeSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type PriceItemInput = z.infer<typeof priceItemSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type LineInputData = z.infer<typeof lineSchema>;
export type SendInput = z.infer<typeof sendSchema>;

/** The customer signing on the link (public). */
export const publicSignSchema = z
  .object({
    signerName: z.string().trim().min(2, "Enter your full name").max(120),
    signerTitle: optText(80),
    signerCompany: optText(120),
    method: z.enum(["DRAWN", "TYPED"]),
    /** data:image/png;base64,… */
    signature: z.string().startsWith("data:image/png;base64,").max(550_000),
    chosen: z.array(z.number().int().min(0).max(1000)).max(200).default([]),
    agreeElectronic: z.literal(true, "Tick to agree to sign electronically"),
    agreeQuote: z.literal(true, "Tick to accept the quote and its terms"),
  })
  .strict();
export const publicCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).strict();
export const publicDeclineSchema = z.object({ reason: z.string().trim().max(2000).optional() }).strict();
