import { z } from "zod";
import { SWIPE_ACTIONS } from "./swipe";

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
    brandId: uuid.nullable().default(null),
    favourite: z.boolean().default(false),
  })
  .strict();

export const brandSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();

export const createQuoteSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    clientId: uuid.nullable().optional(),
    siteAddress: optText(300),
    projectId: uuid.nullable().optional(),
    /** Started from a floor: the site, building and level (the job goes there). */
    siteId: uuid.nullable().optional(),
    buildingId: uuid.nullable().optional(),
    levelId: uuid.nullable().optional(),
  })
  .strict();

/** A quote made outside Grid, uploaded as a PDF. */
export const uploadQuoteSchema = z
  .object({
    fileId: uuid,
    title: z.string().trim().min(1, "Say what the quote is for").max(200),
    /** The number on the PDF; blank takes the next one (Q-1005). */
    number: optText(40),
    clientId: uuid.nullable().optional(),
    /** The total on the PDF, including tax, in dollars. */
    total: z.number().min(0).max(100_000_000).nullable().optional(),
    siteAddress: optText(300),
    /** When it was sent (YYYY-MM-DD); today if left out. */
    sentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    /** Waiting for an answer, or already accepted. */
    status: z.enum(["SENT", "ACCEPTED"]).default("SENT"),
    /** Attached to an existing job. */
    projectId: uuid.nullable().optional(),
    /** At an existing site (and building and floor): the job goes there when it's accepted. */
    siteId: uuid.nullable().optional(),
    buildingId: uuid.nullable().optional(),
    levelId: uuid.nullable().optional(),
  })
  .strict();

export const lineSchema = z
  .object({
    section: optText(100),
    priceItemId: uuid.nullable().optional(),
    /** Labour, material or (null) other. Material lines get the materials markup. */
    kind: z.enum(["LABOUR", "MATERIAL"]).nullable().default(null),
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
    /** Materials markup: on or off, and the % (kept when switched off). Needs quotes.costs.view. */
    materialsMarkup: z.boolean(),
    materialsMarkupPct: z.number().min(0).max(10000).nullable(),
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
export type PriceItemInput = z.infer<typeof priceItemSchema>;
export type BrandInput = z.infer<typeof brandSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UploadQuoteInput = z.infer<typeof uploadQuoteSchema>;
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

/** Settings › You › Quote screen: what swiping a quote line does, for one person. */
export const userSettingsSchema = z
  .object({
    swipeLeft: z.enum(SWIPE_ACTIONS),
    swipeRight: z.enum(SWIPE_ACTIONS),
  })
  .strict();
export type UserSettingsInput = z.infer<typeof userSettingsSchema>;
