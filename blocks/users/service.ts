// Public service API of the users block. Blocks that depend on
// "users" import from "@grid/block-users" (index.ts), never deeper.
import { audit, db, type Prisma, type Tx } from "@grid/db";
import { notFound } from "@grid/core";
import { emailSchema, type UpdateProfileInput } from "./validation";

const publicFields = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatarKey: true,
  settings: true,
  createdAt: true,
} as const;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicFields }>;

export async function getUser(id: string, tx: Tx = db): Promise<PublicUser> {
  const user = await tx.user.findFirst({ where: { id, deletedAt: null }, select: publicFields });
  if (!user) throw notFound("User not found");
  return user;
}

export async function findUserByEmail(email: string, tx: Tx = db): Promise<PublicUser | null> {
  return tx.user.findFirst({ where: { email: emailSchema.parse(email), deletedAt: null }, select: publicFields });
}

/**
 * Returns the user with this email, creating a placeholder account if
 * none exists (used when inviting someone who hasn't signed up yet).
 */
export async function ensureUser(
  input: { email: string; name?: string },
  actorId: string | null,
  tx: Tx = db,
): Promise<{ user: PublicUser; created: boolean }> {
  const email = emailSchema.parse(input.email);
  const existing = await findUserByEmail(email, tx);
  if (existing) return { user: existing, created: false };
  const user = await tx.user.create({
    data: { email, name: input.name?.trim() || email.split("@")[0]! },
    select: publicFields,
  });
  await audit(tx, { blockId: "users", actorId, entityType: "User", entityId: user.id, action: "created", diff: { email } });
  return { user, created: true };
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  return db.$transaction(async (tx) => {
    await getUser(userId, tx);
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        phone: input.phone,
        settings: input.settings as Prisma.InputJsonValue | undefined,
      },
      select: publicFields,
    });
    await audit(tx, {
      blockId: "users",
      actorId: userId,
      entityType: "User",
      entityId: userId,
      action: "profile_updated",
      diff: input as Prisma.InputJsonValue,
    });
    return user;
  });
}
