// Public API for blocks that depend on "companies".
export {
  resolveAccess,
  listMyCompanies,
  getCurrentCompany,
  syncSystemRoles,
  isSolo,
  defaultCompanyId,
  hasAnyMembership,
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
