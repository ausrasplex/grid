import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => (value ? value : null));

export const themeSchema = z
  .object({
    logoFileId: z.string().uuid().nullable(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
    phone: optionalText(40),
    email: optionalText(200),
    address: optionalText(300),
    website: optionalText(200),
    licenceLabel: optionalText(40),
    licenceNumber: optionalText(60),
    footerText: optionalText(500),
  })
  .strict();

export type ThemeInput = z.infer<typeof themeSchema>;
