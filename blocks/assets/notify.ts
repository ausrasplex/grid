// Telling Owners and Foremen (docs/assets-block.md §3 step 5, §3a step 4):
// everyone whose role can manage faults, except whoever reported it. By
// email for now (when the server has email set up); push and the inbox
// come with notifications (stage 6). Never stops the report itself.

import "server-only";
import { app } from "@grid/core";
import { db } from "@grid/db";

export async function tellManagers(companyId: string, exceptUserId: string, mail: { subject: string; text: string }) {
  try {
    if (!(await app().mail.configured())) return;
    const members = await db.membership.findMany({
      where: { companyId, status: "ACTIVE", userId: { not: exceptUserId }, OR: [{ role: { systemRole: "OWNER" } }, { role: { permissions: { has: "assets.faults.manage" } } }] },
      select: { user: { select: { email: true } } },
    });
    for (const member of members) {
      if (member.user.email) await app().mail.send({ to: member.user.email, subject: mail.subject, text: mail.text });
    }
  } catch (error) {
    console.error("[assets] couldn't email the managers", error);
  }
}
