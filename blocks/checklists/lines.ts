// Small rules for checklists, with no imports so they're unit-tested.

/**
 * Text typed or pasted into "Add an item": each line is an item. Bullets,
 * dashes, numbers and tick boxes people paste from notes are taken off.
 */
export function itemsFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•·]|\[[ xX✓]?\]|☐|☑|✓|✔|\d+[.)])\s*/u, "")
        .trim(),
    )
    .filter(Boolean);
}

export interface ItemOrder {
  position: number;
  doneAt: Date | string | null;
}

/** To do first (in list order), then done (most recently done first). */
export function showOrder<T extends ItemOrder>(items: T[]): { todo: T[]; done: T[] } {
  const todo = items.filter((item) => !item.doneAt).sort((first, second) => first.position - second.position);
  const done = items
    .filter((item) => item.doneAt)
    .sort((first, second) => new Date(second.doneAt!).getTime() - new Date(first.doneAt!).getTime() || first.position - second.position);
  return { todo, done };
}
