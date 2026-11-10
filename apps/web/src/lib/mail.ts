// Server email: sign-in links and password resets. Platform-controlled
// wording (companies can't restyle these, docs/templates-block.md).
//
// The email server is set in the app (Settings › Email, server admin), not
// in environment variables, so changing provider is just a form. Without
// one, emails are printed to the server log, which is fine in development
// and for a sole trader who signs in with a password.
// Phase 6 adds each business's own email for quotes, invites and alerts.

import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { decryptSecret, getEmailSettings, type EmailSettings } from "@grid/db";

import type { OutgoingMail } from "@grid/core";

export type Mail = OutgoingMail;

// Rebuilt whenever the settings are saved (keyed by their save time).
let cached: { stamp: number; transport: Transporter; from: string } | null = null;

export function transportFor(settings: EmailSettings): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === "ssl",
    requireTLS: settings.security === "starttls",
    auth: settings.username ? { user: settings.username, pass: settings.passwordEnc ? decryptSecret(settings.passwordEnc) : "" } : undefined,
    connectionTimeout: 15_000,
  });
}

export const fromHeader = (settings: EmailSettings) => (settings.fromName ? `"${settings.fromName.replace(/"/g, "")}" <${settings.fromAddress}>` : settings.fromAddress);

async function current(): Promise<{ transport: Transporter; from: string } | null> {
  const settings = await getEmailSettings();
  if (!settings.enabled || !settings.host || !settings.fromAddress) return null;
  const stamp = settings.updatedAt?.getTime() ?? 0;
  if (!cached || cached.stamp !== stamp) cached = { stamp, transport: transportFor(settings), from: fromHeader(settings) };
  return cached;
}

/** True when sign-in emails actually leave the server. */
export async function emailConfigured(): Promise<boolean> {
  return !!(await current());
}

/** Sign-in links are offered when they can be delivered (or in development, via the log). */
export async function signInLinksAvailable(): Promise<boolean> {
  return (await emailConfigured()) || process.env.NODE_ENV !== "production";
}

export async function sendMail(mail: Mail): Promise<void> {
  const active = await current();
  if (!active) {
    const attachmentsNote = mail.attachments?.length ? `\n  Attachments: ${mail.attachments.map((attachment) => attachment.filename).join(", ")}` : "";
    console.log(`\n[mail] No email server is set up (Settings › Email), so this email was not sent.\n  To: ${mail.to}\n  Subject: ${mail.subject}${attachmentsNote}\n\n${mail.text}\n`);
    return;
  }
  await active.transport.sendMail({
    from: active.from,
    to: mail.to,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachments?.map((attachment) => ({ filename: attachment.filename, content: Buffer.from(attachment.content), contentType: attachment.contentType })),
  });
}
