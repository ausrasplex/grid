// Swiping a line on the quote screen: what each direction does is set by
// each person in Settings › You › Quote screen. No imports, so the settings
// form, the server check and the quote screen share it.

export const SWIPE_ACTIONS = ["OFF", "DELETE", "DUPLICATE", "OPTIONAL", "SECTION", "QTY_UP"] as const;
export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

/** In the settings list. */
export const SWIPE_ACTION_NAMES: Record<SwipeAction, string> = {
  OFF: "Nothing",
  DELETE: "Delete (with Undo)",
  DUPLICATE: "Duplicate",
  OPTIONAL: "Optional extra on/off",
  SECTION: "Move to section…",
  QTY_UP: "Quantity +1",
};

export const isSwipeAction = (value: unknown): value is SwipeAction => (SWIPE_ACTIONS as readonly unknown[]).includes(value);
