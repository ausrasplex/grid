// How a material reads in lists and on quotes. Pure, so pages, the price
// book and tests share it.

export interface MaterialWords {
  name: string;
  brand?: string | null;
  finish?: string | null;
  model?: string | null;
}

/** What a price book item and a quote line call it: "Iconic double switch, White". */
export const priceBookName = (material: MaterialWords) => (material.finish ? `${material.name}, ${material.finish}` : material.name);

/** One line under the name in lists: "Clipsal · 3042 · White". */
export const materialMeta = (material: MaterialWords) => [material.brand, material.model, material.finish].filter(Boolean).join(" · ");

/** "#1f2937" style colour, or null. */
export function cleanSwatch(value: string | null | undefined): string | null {
  const text = (value ?? "").trim().toLowerCase();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (!match) return null;
  const digits = match[1]!.length === 3 ? [...match[1]!].map((digit) => digit + digit).join("") : match[1]!;
  return `#${digits}`;
}

/** A web address as typed ("beacon.com.au/…") made openable. */
export function cleanLink(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}
