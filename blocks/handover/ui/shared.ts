// What the handover screens get from the server (service.ts HandoverView), as JSON.
import type { MaterialJson } from "@grid/block-materials/components";

export interface LineJson {
  id: string;
  materialId: string;
  trade: string;
  room: string | null;
  qty: number | null;
  note: string | null;
  source: "MANUAL" | "PLANS" | "QUOTE";
  editedByHand: boolean;
  createdAt: string;
  sortName: string;
  material: MaterialJson;
}

export interface JobSettingsJson {
  showQty: boolean;
  roomPerPage: boolean;
  cover: boolean;
  title: string | null;
  coverFileId: string | null;
  roomOrder: string[];
}

export interface CompanySettingsJson {
  title: string;
  tradeNames: Record<string, string>;
  tradeColumns: Record<string, string[]>;
}

export interface HandoverJson {
  job: { id: string; name: string; siteName: string; address: string; clientId: string | null; clientName: string | null; archived: boolean };
  settings: JobSettingsJson;
  company: CompanySettingsJson;
  lines: LineJson[];
  rooms: string[];
  groups: { trade: string; rooms: { room: string | null; lines: LineJson[] }[] }[];
}

export interface ShareJson {
  id: string;
  link: string;
  expiresAt: string | null;
  createdBy: string;
  createdAt: string;
  lastOpenedAt: string | null;
  openCount: number;
}

export const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** "White · 90 mm": the line under a material's name on the list. */
export const finishLine = (material: Pick<MaterialJson, "brand" | "finish" | "size">) => [material.brand, material.finish, material.size].filter(Boolean).join(" · ");
