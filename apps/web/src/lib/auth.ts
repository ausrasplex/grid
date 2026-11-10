// Sign-in, powered by Better Auth (docs/roadmap.md, Phase 1).
//
//  - Email and password, plus a sign-in link by email.
//  - Long sessions on a person's own phone or tablet (60 days, renewed daily).
//  - Self-hosted servers are invite-only: anyone can create the FIRST account
//    on a fresh server (it becomes the server admin); after that, people get
//    in through an invite from a company. SIGNUP_MODE=open (the hosted site,
//    later) lets anyone sign up.
//
// Everything else in the app asks lib/session.ts who is signed in, so blocks
// never talk to Better Auth directly.

import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { db } from "@grid/db";
import { sendMail } from "./mail";

const DAY = 60 * 60 * 24;

export const SIGNUP_MODE: "invite" | "open" = process.env.SIGNUP_MODE === "open" ? "open" : "invite";

/**
 * True once anyone has a way to sign in. Invited people who haven't signed in
 * yet exist as users without an account row, so they don't count.
 */
export async function serverHasAccounts(): Promise<boolean> {
  return (await db.account.count()) > 0;
}

/** Whether the sign-in screen offers "Create an account". */
export async function signUpOpen(): Promise<boolean> {
  return SIGNUP_MODE === "open" || !(await serverHasAccounts());
}

const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const auth = betterAuth({
  appName: "Grid",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: prismaAdapter(db, { provider: "postgresql" }),
  advanced: {
    database: { generateId: "uuid" },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your Grid password",
        text: `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in an hour.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
      });
    },
  },

  session: {
    expiresIn: 60 * DAY,
    updateAge: DAY,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  plugins: [
    magicLink({
      // Only people who already exist (signed up, or invited by a company).
      disableSignUp: true,
      expiresIn: 15 * 60,
      sendMagicLink: async ({ email, url }) => {
        await sendMail({
          to: email,
          subject: "Your Grid sign-in link",
          text: `Tap this link to sign in to Grid. It works once and expires in 15 minutes.\n\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
        });
      },
    }),
    nextCookies(), // must stay last
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && !(await signUpOpen())) {
        throw new APIError("FORBIDDEN", {
          message: "This server is invite-only. Ask the business you work with to invite you.",
        });
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
        // The first person on a fresh server becomes its admin.
        after: async (user) => {
          if ((await db.user.count()) === 1) {
            await db.user.update({ where: { id: user.id }, data: { serverAdmin: true } });
          }
        },
      },
    },
  },
});
