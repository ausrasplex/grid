// Server-wide settings the server admin changes in Settings › Storage.
// Stored in ServerSetting. Not environment variables: each setting has one home.

import { db, type Tx } from "./client";
import type { Prisma } from "./generated/client";
import { isPageLevel, isPlanLevel, type PageLevel, type PlanLevel } from "./render-levels";

export type CleanupMode = "on" | "dry-run" | "off";

export interface StorageSettings {
  /** Uploads never filed against a job are removed after this many days. */
  unfiledDays: number;
  /** Deleted photos and notes stay in Recently deleted this many days, then are purged. */
  deletedDays: number;
  /** "dry-run" logs what would go without removing anything. */
  mode: CleanupMode;
  /** When the nightly clean-up runs, server time, "HH:MM". */
  time: string;
}

const KEY = "storage";

/**
 * A new server's starting values. They live only in the app (Settings ›
 * Storage), not in environment variables, so each setting has one home.
 */
export function storageDefaults(): StorageSettings {
  return { unfiledDays: 7, deletedDays: 30, mode: "on", time: "02:30" };
}

export async function getStorageSettings(tx: Tx = db): Promise<StorageSettings> {
  const row = await tx.serverSetting.findUnique({ where: { key: KEY } });
  return { ...storageDefaults(), ...((row?.value as Partial<StorageSettings> | undefined) ?? {}) };
}

export async function setStorageSettings(input: StorageSettings, userId: string, tx: Tx = db) {
  await tx.serverSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: input as unknown as Prisma.InputJsonValue, updatedById: userId },
    update: { value: input as unknown as Prisma.InputJsonValue, updatedById: userId },
  });
}

/** When something deleted at `deletedAt` will be purged. */
export function purgeDate(deletedAt: Date, days: number): Date {
  return new Date(deletedAt.getTime() + days * 86_400_000);
}

// ---------------------------------------------------------------------
// Server email (sign-in links, password resets; later the fallback for
// businesses without their own). Changed in Settings › Email by the server
// admin, never in environment variables, so switching provider is just a
// form. The password is stored encrypted with APP_ENCRYPTION_KEY.
// ---------------------------------------------------------------------

export type SmtpSecurity = "ssl" | "starttls" | "none";

export interface EmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  /** Encrypted (secrets.ts). Never sent to the browser. */
  passwordEnc: string | null;
  fromName: string;
  fromAddress: string;
}

const EMAIL_KEY = "email";

export function emailDefaults(): EmailSettings {
  return { enabled: false, host: "", port: 465, security: "ssl", username: "", passwordEnc: null, fromName: "Grid", fromAddress: "" };
}

export async function getEmailSettings(tx: Tx = db): Promise<EmailSettings & { updatedAt: Date | null }> {
  const row = await tx.serverSetting.findUnique({ where: { key: EMAIL_KEY } });
  return { ...emailDefaults(), ...((row?.value as Partial<EmailSettings> | undefined) ?? {}), updatedAt: row?.updatedAt ?? null };
}

export async function setEmailSettings(input: EmailSettings, userId: string, tx: Tx = db) {
  const value = input as unknown as Prisma.InputJsonValue;
  await tx.serverSetting.upsert({
    where: { key: EMAIL_KEY },
    create: { key: EMAIL_KEY, value, updatedById: userId },
    update: { value, updatedById: userId },
  });
}

// ---------------------------------------------------------------------
// Backups (docs/backups.md): set in Settings › Backups by the server admin.
// ---------------------------------------------------------------------

export interface BackupSettings {
  /** What scheduled backups include (and Back up now's starting ticks). */
  includeDatabase: boolean;
  includeMedia: boolean;
  schedule: "off" | "daily" | "weekly";
  /** 0 = Sunday … 6 = Saturday, for weekly. */
  day: number;
  /** "HH:MM", server time. */
  time: string;
  /** Keep the latest N backups (pinned ones don't count). */
  keep: number;
}

const BACKUP_KEY = "backups";

export function backupDefaults(): BackupSettings {
  return { includeDatabase: true, includeMedia: true, schedule: "daily", day: 0, time: "03:00", keep: 7 };
}

export async function getBackupSettings(tx: Tx = db): Promise<BackupSettings> {
  const row = await tx.serverSetting.findUnique({ where: { key: BACKUP_KEY } });
  return { ...backupDefaults(), ...((row?.value as Partial<BackupSettings> | undefined) ?? {}) };
}

export async function setBackupSettings(input: BackupSettings, userId: string, tx: Tx = db) {
  const value = input as unknown as Prisma.InputJsonValue;
  await tx.serverSetting.upsert({ where: { key: BACKUP_KEY }, create: { key: BACKUP_KEY, value, updatedById: userId }, update: { value, updatedById: userId } });
}

// ---------------------------------------------------------------------
// Maps (address suggestions from Google): set in Settings › Maps by the
// server admin. The API key is stored encrypted and only ever used on the
// server (apps/web/src/lib/places.ts); browsers ask Grid, never Google.
// ---------------------------------------------------------------------

export interface MapsSettings {
  enabled: boolean;
  /** Google Maps Platform key with Places API (New) on. Encrypted (secrets.ts). Never sent to the browser. */
  apiKeyEnc: string | null;
  /** Suggest addresses in this country only (two letters, e.g. "au"); "" for anywhere. */
  country: string;
}

const MAPS_KEY = "maps";

export function mapsDefaults(): MapsSettings {
  return { enabled: false, apiKeyEnc: null, country: "au" };
}

export async function getMapsSettings(tx: Tx = db): Promise<MapsSettings & { updatedAt: Date | null }> {
  const row = await tx.serverSetting.findUnique({ where: { key: MAPS_KEY } });
  return { ...mapsDefaults(), ...((row?.value as Partial<MapsSettings> | undefined) ?? {}), updatedAt: row?.updatedAt ?? null };
}

export async function setMapsSettings(input: MapsSettings, userId: string, tx: Tx = db) {
  const value = input as unknown as Prisma.InputJsonValue;
  await tx.serverSetting.upsert({ where: { key: MAPS_KEY }, create: { key: MAPS_KEY, value, updatedById: userId }, update: { value, updatedById: userId } });
}

// ---------------------------------------------------------------------
// Plans & PDFs: how sharp plans, documents and quote PDFs are drawn for the
// in-app viewers (render-levels.ts). Set in Settings › Plans & PDFs by the
// server admin: better hardware can draw sharper.
// ---------------------------------------------------------------------

export interface RenderingSettings {
  plans: PlanLevel;
  documents: PageLevel;
  quotes: PageLevel;
}

const RENDERING_KEY = "rendering";

export function renderingDefaults(): RenderingSettings {
  return { plans: "MEDIUM", documents: "MEDIUM", quotes: "MEDIUM" };
}

export async function getRenderingSettings(tx: Tx = db): Promise<RenderingSettings & { updatedAt: Date | null }> {
  const row = await tx.serverSetting.findUnique({ where: { key: RENDERING_KEY } });
  const saved = (row?.value as Partial<RenderingSettings> | undefined) ?? {};
  const defaults = renderingDefaults();
  return {
    plans: isPlanLevel(saved.plans) ? saved.plans : defaults.plans,
    documents: isPageLevel(saved.documents) ? saved.documents : defaults.documents,
    quotes: isPageLevel(saved.quotes) ? saved.quotes : defaults.quotes,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function setRenderingSettings(input: RenderingSettings, userId: string, tx: Tx = db) {
  const value = input as unknown as Prisma.InputJsonValue;
  await tx.serverSetting.upsert({ where: { key: RENDERING_KEY }, create: { key: RENDERING_KEY, value, updatedById: userId }, update: { value, updatedById: userId } });
}

export { lastDue, nextDue } from "./schedule";
