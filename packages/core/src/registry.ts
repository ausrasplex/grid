// Holds every block compiled into the app, checks they fit together,
// and answers: what's enabled for this company, what permissions exist,
// what goes in each menu slot.

import {
  SYSTEM_ROLES,
  type MenuItem,
  type MenuSlot,
  type BlockDefinition,
  type Permission,
  type PermissionDef,
  type RequestContext,
  type SystemRole,
} from "./block.ts";
import { EventBus, type EnabledCheck } from "./events.ts";

export class BlockRegistry {
  /** Blocks in dependency order (a block always comes after what it depends on). */
  readonly blocks: readonly BlockDefinition[];
  private readonly byId: Map<string, BlockDefinition>;

  constructor(definitions: BlockDefinition[]) {
    this.byId = new Map();
    for (const definition of definitions) {
      if (this.byId.has(definition.id)) throw new Error(`Block "${definition.id}" registered twice`);
      this.byId.set(definition.id, definition);
    }
    for (const definition of definitions) {
      for (const dependency of definition.dependsOn ?? []) {
        if (!this.byId.has(dependency)) throw new Error(`Block "${definition.id}" depends on missing block "${dependency}"`);
      }
      if (definition.required) {
        for (const dependency of definition.dependsOn ?? []) {
          if (!this.byId.get(dependency)!.required) {
            throw new Error(`Required block "${definition.id}" can't depend on optional block "${dependency}"`);
          }
        }
      }
    }
    this.blocks = this.sort(definitions);
    this.checkUnique();
  }

  private sort(definitions: BlockDefinition[]): BlockDefinition[] {
    const out: BlockDefinition[] = [];
    const state = new Map<string, "visiting" | "done">();
    const visit = (definition: BlockDefinition, path: string[]) => {
      const visitState = state.get(definition.id);
      if (visitState === "done") return;
      if (visitState === "visiting") throw new Error(`Block dependency cycle: ${[...path, definition.id].join(" -> ")}`);
      state.set(definition.id, "visiting");
      for (const dependency of definition.dependsOn ?? []) visit(this.byId.get(dependency)!, [...path, definition.id]);
      state.set(definition.id, "done");
      out.push(definition);
    };
    for (const definition of definitions) visit(definition, []);
    return out;
  }

  private checkUnique(): void {
    const permissionKeys = new Set<string>();
    for (const block of this.blocks) {
      for (const permission of block.permissions ?? []) {
        if (permissionKeys.has(permission.key)) throw new Error(`Permission "${permission.key}" declared twice`);
        permissionKeys.add(permission.key);
      }
    }
    const menus = new Set<string>();
    for (const block of this.blocks) {
      for (const item of block.menus ?? []) {
        if (menus.has(item.id)) throw new Error(`Menu id "${item.id}" used twice`);
        menus.add(item.id);
        if (item.permission && !permissionKeys.has(item.permission)) {
          throw new Error(`Menu "${item.id}" needs undeclared permission "${item.permission}"`);
        }
      }
    }
  }

  get(id: string): BlockDefinition | undefined {
    return this.byId.get(id);
  }

  /** Every permission in the app, grouped by block, for the role editor. */
  permissionCatalog(): { blockId: string; blockName: string; permissions: PermissionDef[] }[] {
    return this.blocks
      .filter((block) => (block.permissions ?? []).length > 0)
      .map((block) => ({ blockId: block.id, blockName: block.name, permissions: block.permissions ?? [] }));
  }

  /** Default permission set for a built-in role. OWNER gets everything. */
  grantsFor(role: SystemRole): Permission[] {
    if (!SYSTEM_ROLES.includes(role)) throw new Error(`Unknown role ${role}`);
    const out: Permission[] = [];
    for (const block of this.blocks) {
      if (role === "OWNER") out.push(...(block.permissions ?? []).map((permission) => permission.key));
      else out.push(...(block.grants?.[role] ?? []));
    }
    return out;
  }

  /**
   * Which blocks are actually on for a company, given the optional
   * blocks it has switched on. Required blocks are always on; a block
   * is off if anything it depends on is off.
   */
  effectiveEnabled(companyEnabled: Iterable<string>): Set<string> {
    const wanted = new Set(companyEnabled);
    const on = new Set<string>();
    for (const block of this.blocks) {
      const selfOn = block.required || wanted.has(block.id);
      const dependenciesOn = (block.dependsOn ?? []).every((dependency) => on.has(dependency));
      if (selfOn && dependenciesOn) on.add(block.id);
    }
    return on;
  }

  /** Enabled blocks that would break if `id` were switched off. */
  dependentsOf(id: string, enabled: ReadonlySet<string>): string[] {
    return this.blocks.filter((block) => enabled.has(block.id) && (block.dependsOn ?? []).includes(id)).map((block) => block.id);
  }

  /** Menu items for a slot that this user should see, sorted. */
  /** Menu items for a slot, filtered by Blocks switched on, permissions and team/solo. Solo items get their soloLabel. */
  menusFor(slot: MenuSlot, ctx: Pick<RequestContext, "permissions" | "enabledBlocks"> & { solo?: boolean }): MenuItem[] {
    const items: MenuItem[] = [];
    for (const block of this.blocks) {
      if (!ctx.enabledBlocks.has(block.id)) continue;
      for (const item of block.menus ?? []) {
        if (item.slot !== slot) continue;
        if (item.permission && !ctx.permissions.has(item.permission)) continue;
        if (item.teamOnly && ctx.solo) continue;
        if (item.soloOnly && !ctx.solo) continue;
        items.push(ctx.solo && item.soloLabel ? { ...item, label: item.soloLabel } : item);
      }
    }
    return items.sort((first, second) => (first.order ?? 100) - (second.order ?? 100) || first.label.localeCompare(second.label));
  }

  /** Where a route code's target opens, or null if no block claims that entity type. */
  routeTarget(entityType: string, entityId: string): string | null {
    for (const block of this.blocks) {
      const targetFor = block.routeTargets?.[entityType];
      if (targetFor) return targetFor(entityId);
    }
    return null;
  }

  /** Builds an event bus with every block's `on` handlers subscribed. */
  createEventBus(isEnabled?: EnabledCheck): EventBus {
    const bus = new EventBus({ isEnabled });
    for (const block of this.blocks) {
      for (const [event, handler] of Object.entries(block.on ?? {})) bus.on(event, block.id, handler);
    }
    return bus;
  }
}
