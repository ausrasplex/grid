import { z } from "zod";
import { HEX_COLOUR, THEME_TOKENS } from "@grid/ui/lib/custom-themes";

const colour = z
  .string()
  .trim()
  .regex(HEX_COLOUR, "Colours are written like #f7d22a")
  .transform((value) => value.toLowerCase());

export const keyColoursSchema = z
  .object({ page: colour, card: colour, text: colour, main: colour, hero: colour, tile1: colour, tile2: colour, tile3: colour })
  .strict();

const tokenNames = THEME_TOKENS.map((token) => token.name) as [string, ...string[]];

export const themeSchema = z
  .object({
    name: z.string().trim().min(1, "Give the theme a name").max(80),
    description: z.string().trim().max(200).default(""),
    look: z.enum(["grid", "soft"]),
    startedFrom: z.string().trim().max(40).default("grid"),
    keyColours: keyColoursSchema,
    overrides: z.partialRecord(z.enum(tokenNames), colour).default({}),
  })
  .strict();

export const scopeSchema = z.enum(["mine", "business"]);

export const createThemeSchema = themeSchema.extend({ scope: scopeSchema.default("mine") });

export const copyThemeSchema = z.object({ scope: scopeSchema.default("mine") }).strict();

/** A theme saved to a file (Export), to bring into another Grid (Import). */
export const themeFileSchema = z.object({
  format: z.literal("grid-theme", "That isn't a Grid theme file"),
  version: z.literal(1, "That theme file is from a newer Grid"),
  theme: themeSchema,
});

export const importThemeSchema = z.object({ scope: scopeSchema.default("mine"), file: themeFileSchema }).strict();

export type ThemeInput = z.infer<typeof themeSchema>;
export type CreateThemeInput = z.infer<typeof createThemeSchema>;
export type ThemeScope = z.infer<typeof scopeSchema>;
export type ThemeFile = z.infer<typeof themeFileSchema>;
