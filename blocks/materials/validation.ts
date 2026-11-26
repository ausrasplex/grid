import { z } from "zod";
import { TRADE_IDS } from "./trades";
import { cleanLink, cleanSwatch } from "./words";

const uuid = z.string().uuid();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const materialSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    itemType: optText(80),
    brandId: uuid.nullable().default(null),
    /** The family's name: an existing one is used, a new one is made. Blank for none. */
    family: optText(200),
    model: optText(120),
    finish: optText(200),
    size: optText(120),
    link: optText(2000).transform(cleanLink),
    trade: z.enum(TRADE_IDS as [string, ...string[]]),
    photoFileId: uuid.nullable().default(null),
    swatch: optText(9).transform(cleanSwatch),
    notes: optText(2000),
  })
  .strict();

export const brandSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();

/** A web address, with https:// added when it's typed without ("makita.com.au/support"). */
const link = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((value) => (value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null));

/** The maker's support details (Docket's brand card), shown on every asset of the brand. */
export const brandSupportSchema = z
  .object({
    website: link,
    supportUrl: link,
    supportPhone: optText(40),
    supportEmail: optText(200),
    notes: optText(2000),
  })
  .strict();

export const listQuery = z.object({
  q: z.string().optional(),
  trade: z.string().optional(),
  /// A brand's id, or "none" for materials without one.
  brand: z.union([uuid, z.literal("none")]).optional(),
  family: uuid.optional(),
});

export const sameQuery = z.object({
  name: z.string(),
  brandId: uuid.optional(),
  model: z.string().optional(),
  finish: z.string().optional(),
  /// The material being changed, so it doesn't match itself.
  not: uuid.optional(),
});

export type MaterialInput = z.infer<typeof materialSchema>;
export type BrandInput = z.infer<typeof brandSchema>;
export type BrandSupportInput = z.infer<typeof brandSupportSchema>;
export type ListQuery = z.infer<typeof listQuery>;
export type SameQuery = z.infer<typeof sameQuery>;
