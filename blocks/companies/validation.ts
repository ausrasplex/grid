import { z } from "zod";
import { emailSchema } from "@grid/block-users";
import { BUSINESS_SIZES, TRADE_PROFILES } from "./presets";

const abn = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine((value) => /^\d{11}$/.test(value), "ABN must be 11 digits");

export const createCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    abn: abn.optional(),
    tradeProfile: z.enum(TRADE_PROFILES),
    /** "solo" = Just me, "team" = With a team. Only picks the starting Blocks. */
    size: z.enum(BUSINESS_SIZES).default("team"),
  })
  .strict();

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    abn: abn.nullable(),
    tradeProfile: z.enum(TRADE_PROFILES),
    settings: z.record(z.string(), z.unknown()),
  })
  .partial()
  .strict();

export const inviteSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().max(120).optional(),
    roleId: z.string().uuid(),
  })
  .strict();

export const changeRoleSchema = z.object({ roleId: z.string().uuid() }).strict();

export const roleSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    permissions: z.array(z.string()).max(500),
  })
  .strict();

export const setBlockSchema = z.object({ enabled: z.boolean() }).strict();

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
