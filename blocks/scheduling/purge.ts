// Visits and settings are rows only (no files). Visits go with a deleted
// job; everything goes with a deleted business. (Time off is core's Leave,
// removed by the companies Block.)

import type { LevelUsage } from "@grid/core";
import { db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  return [{ count: await db.visit.count({ where: { companyId, status: { not: "CANCELLED" } } }), one: "booked visit", many: "booked visits" }];
}

export async function purgeProject(projectId: string): Promise<string[]> {
  await db.visit.deleteMany({ where: { projectId } });
  return [];
}

export async function purgeCompany(companyId: string): Promise<void> {
  await db.visit.deleteMany({ where: { companyId } });
  await db.schedulingSettings.deleteMany({ where: { companyId } });
  await db.schedulingUserSettings.deleteMany({ where: { companyId } });
  await db.calendarFeed.deleteMany({ where: { companyId } });
}
