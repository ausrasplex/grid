// In-process event bus so blocks react to each other without importing
// each other. e.g. plans emits "plans.revision.approved"; rfis listens.
//
// Handlers run after the emitting action has committed. One failing
// handler never breaks the emitter or other handlers — it is logged.
// Stage 3 swaps the transport for durable pg-boss jobs; the API stays.

import type { EventHandler, EventMeta } from "./block.ts";

interface Subscription {
  blockId: string;
  handler: EventHandler;
}

export type EnabledCheck = (blockId: string, companyId: string | null) => boolean | Promise<boolean>;

export class EventBus {
  private readonly subs = new Map<string, Subscription[]>();
  private readonly isEnabled: EnabledCheck;
  private readonly log: (message: string, error: unknown) => void;

  constructor(options: { isEnabled?: EnabledCheck; log?: (message: string, error: unknown) => void } = {}) {
    this.isEnabled = options.isEnabled ?? (() => true);
    this.log = options.log ?? ((message, error) => console.error(message, error));
  }

  on(event: string, blockId: string, handler: EventHandler): void {
    const list = this.subs.get(event) ?? [];
    list.push({ blockId, handler });
    this.subs.set(event, list);
  }

  /**
   * Runs every subscriber whose block is enabled for meta.companyId.
   * Resolves once all handlers finish; never rejects.
   */
  async emit(event: string, payload: unknown, meta: EventMeta): Promise<{ ran: string[]; failed: string[] }> {
    const ran: string[] = [];
    const failed: string[] = [];
    for (const sub of this.subs.get(event) ?? []) {
      if (!(await this.isEnabled(sub.blockId, meta.companyId))) continue;
      try {
        await sub.handler(payload, meta);
        ran.push(sub.blockId);
      } catch (error) {
        failed.push(sub.blockId);
        this.log(`[events] ${sub.blockId} failed handling "${event}"`, error);
      }
    }
    return { ran, failed };
  }
}
