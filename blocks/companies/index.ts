// Public API for blocks that depend on "companies".
export {
  resolveAccess,
  listMyCompanies,
  getCurrentCompany,
  listMembers,
  syncSystemRoles,
  isSolo,
  defaultCompanyId,
  hasAnyMembership,
  inviteByLink,
  acceptInviteLink,
  type InviteByLink,
  type CompanyAccess,
} from "./service";
export {
  TRADE_PROFILES,
  TRADE_PRESETS,
  BUSINESS_SIZES,
  SOLO_BLOCKS,
  TEAM_BLOCKS,
  startingBlocks,
  type TradeProfileId,
  type BusinessSize,
} from "./presets";
export {
  adminDeleteCompany,
  adminRestoreCompany,
  companiesToPurge,
  companyUsage,
  listAllCompanies,
  listMyDeletedCompanies,
  purgeCompanyRecords,
} from "./deletion";
export { TRADES, tradeLabel, tradeOptions, type Trade } from "./trades";

/** Event payloads, so listeners in other blocks are typed. */
export interface MemberInvitedEvent {
  companyId: string;
  membershipId: string;
  userId: string;
  email: string;
  role: string;
  invitedBy: string;
}
export interface MemberRemovedEvent {
  companyId: string;
  membershipId: string;
  userId: string;
}
export interface BlocksChangedEvent {
  companyId: string;
  blockId: string;
  enabled: boolean;
}
