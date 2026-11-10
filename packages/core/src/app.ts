// The running app's shared services, set once at startup by the app
// (apps/web/src/blocks.ts) so block code can reach the registry and
// event bus without importing the app.

import type { EventBus } from "./events.ts";
import type { BlockRegistry } from "./registry.ts";

/** An email Grid sends (quotes, sign-in links…). */
export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Uint8Array; contentType?: string }[];
}

/**
 * Sending email, provided by the app (the server's email settings, and in
 * phase 6 each business's own). Blocks never set up SMTP themselves.
 */
export interface Mailer {
  /** False when no email server is set up: emails would only be logged. */
  configured(): Promise<boolean>;
  send(mail: OutgoingMail): Promise<void>;
}

/**
 * Background work (pg-boss). A block lists its handlers in its manifest
 * (`jobs`); `send("plans.render", {...})` queues one. When scheduled jobs
 * are off in this container, the work runs straight away instead.
 */
export interface JobQueue {
  send(name: string, data: Record<string, unknown>): Promise<void>;
}

export interface AppServices {
  registry: BlockRegistry;
  events: EventBus;
  mail: Mailer;
  jobs: JobQueue;
}

let services: AppServices | null = null;

export function configureApp(appServices: AppServices): void {
  services = appServices;
}

export function app(): AppServices {
  if (!services) throw new Error("configureApp() hasn't been called yet");
  return services;
}
