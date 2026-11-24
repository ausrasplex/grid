// Putting a job's handover lines in order (docs/materials-block.md §2 "Sort"):
// trades in the fixed Materials order, then rooms (General first, then the
// job's room order, then any others in the order they were first used),
// then items by name. Plain functions, shared by the page, the PDF and the
// client's link, and tested.

export interface Groupable {
  trade: string;
  room: string | null;
  /** What the line sorts by within its room (the material's item type and name). */
  sortName: string;
  /** When it was added (first used first, for rooms without an order). */
  createdAt: Date | string;
}

export interface RoomGroup<T> {
  /** Null is General. */
  room: string | null;
  lines: T[];
}

export interface TradeGroup<T> {
  trade: string;
  rooms: RoomGroup<T>[];
}

/** "  ensuite " and "Ensuite" are the same room. */
export const roomKey = (room: string | null | undefined) => (room ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** A typed room tidied for saving: spaces trimmed, blank is General (null). */
export function cleanRoom(room: string | null | undefined): string | null {
  const tidy = (room ?? "").trim().replace(/\s+/g, " ");
  return tidy ? tidy : null;
}

/** The job's rooms in print order (no General), each spelt as first used. */
export function orderedRooms(lines: readonly Pick<Groupable, "room" | "createdAt">[], roomOrder: readonly string[]): string[] {
  const firstUsed = new Map<string, { name: string; at: number }>();
  for (const line of lines) {
    const key = roomKey(line.room);
    if (!key) continue;
    const at = new Date(line.createdAt).getTime();
    const seen = firstUsed.get(key);
    if (!seen || at < seen.at) firstUsed.set(key, { name: cleanRoom(line.room)!, at: seen ? Math.min(seen.at, at) : at });
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  for (const name of roomOrder) {
    const key = roomKey(name);
    const room = firstUsed.get(key);
    if (!room || placed.has(key)) continue;
    ordered.push(room.name);
    placed.add(key);
  }
  const rest = [...firstUsed.entries()].filter(([key]) => !placed.has(key)).sort((first, second) => first[1].at - second[1].at);
  return [...ordered, ...rest.map(([, room]) => room.name)];
}

/** Lines grouped by trade (in tradeOrder; unknown trades last), then room. Empty groups are left out. */
export function groupSchedule<T extends Groupable>(lines: readonly T[], options: { tradeOrder: readonly string[]; roomOrder: readonly string[] }): TradeGroup<T>[] {
  const trades = [...new Set(lines.map((line) => line.trade))].sort((first, second) => {
    const rank = (trade: string) => {
      const index = options.tradeOrder.indexOf(trade);
      return index < 0 ? options.tradeOrder.length : index;
    };
    return rank(first) - rank(second) || first.localeCompare(second);
  });
  const rooms = orderedRooms(lines, options.roomOrder);
  const byName = (first: T, second: T) => first.sortName.localeCompare(second.sortName, "en-AU", { sensitivity: "base", numeric: true });
  return trades.map((trade) => {
    const mine = lines.filter((line) => line.trade === trade);
    const general = mine.filter((line) => !roomKey(line.room)).sort(byName);
    const groups: RoomGroup<T>[] = general.length ? [{ room: null, lines: general }] : [];
    for (const room of rooms) {
      const here = mine.filter((line) => roomKey(line.room) === roomKey(room)).sort(byName);
      if (here.length) groups.push({ room, lines: here });
    }
    return { trade, rooms: groups };
  });
}

/** A quantity as printed: "12", "2.5"; none is "TBC". */
export function formatQty(qty: number | null | undefined): string {
  if (qty === null || qty === undefined || Number.isNaN(qty)) return "TBC";
  return String(Math.round(qty * 1000) / 1000);
}

/** "20 July 2025". */
export const preparedDate = (date: Date, timeZone?: string) => date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone });
