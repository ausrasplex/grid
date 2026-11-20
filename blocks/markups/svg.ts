// SVG icons (Settings › Icons): a business can upload an SVG as an
// icon. Nothing from the upload is kept as-is: it's read tag by tag and
// rebuilt from an allowlist of drawing elements and attributes, so scripts,
// event handlers, links, embedded pictures, styles sheets, external
// references and entities can't come through. On top of that it's only ever
// shown as a picture (`<img>` / SVG `<image>` with a data: URL), which
// browsers never run scripts in or let load anything.
// No imports: the phone and the server share it, and it's unit-tested.

/** Bigger than any sensible icon; keeps the reader quick. */
export const SVG_MAX_LENGTH = 200_000;

const ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
]);
/** Proper casing for the camelCase ones (read in lower case). */
const CASED: Record<string, string> = { lineargradient: "linearGradient", radialgradient: "radialGradient", clippath: "clipPath" };

/** Dropped with everything inside them, quietly (editors add these). */
const SKIPPED = new Set(["title", "desc", "metadata", "style", "script", "foreignobject", "image", "use", "a", "animate", "animatemotion", "animatetransform", "set", "iframe", "symbol", "pattern", "filter", "marker", "switch", "font", "view", "cursor"]);

const ATTRIBUTES = new Set([
  "id",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "dx",
  "dy",
  "fx",
  "fy",
  "width",
  "height",
  "points",
  "transform",
  "viewbox",
  "preserveaspectratio",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "clip-path",
  "clip-rule",
  "mask",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "spreadmethod",
  "clippathunits",
  "maskunits",
  "font-size",
  "font-weight",
  "font-family",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "vector-effect",
  "display",
  "visibility",
]);
const CASED_ATTRIBUTES: Record<string, string> = {
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  spreadmethod: "spreadMethod",
  clippathunits: "clipPathUnits",
  maskunits: "maskUnits",
};
/** Style properties kept, turned into attributes (Illustrator and Inkscape put colours in `style`). */
const STYLE_PROPERTIES = new Set([
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "stop-color",
  "stop-opacity",
  "font-size",
  "font-weight",
  "font-family",
  "font-style",
  "text-anchor",
  "display",
  "visibility",
]);
/** References: only to something inside the same icon. */
const PAINT_REFERENCE = /^url\(\s*#[\w.-]+\s*\)$/;

export class SvgError extends Error {}

/** A value that's safe to keep, or null to drop the attribute. */
function cleanValue(name: string, raw: string): string | null {
  const value = decodeBasic(raw).trim();
  if (!value || value.length > 20_000) return null;
  if (/[<>"`\\]/.test(value)) return null;
  if (/(javascript|data|vbscript)\s*:/i.test(value) || /expression\s*\(/i.test(value) || /@import/i.test(value)) return null;
  if (/url\s*\(/i.test(value)) return ["fill", "stroke", "clip-path", "mask"].includes(name) && PAINT_REFERENCE.test(value) ? value : null;
  if (name === "id" && !/^[\w.-]+$/.test(value)) return null;
  return value;
}

/** Only the plain named characters and numbers; anything else (custom entities) isn't allowed. */
function decodeBasic(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, code: string) => {
    const lower = code.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const number = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(number) && number > 31 && number < 0x10ffff ? String.fromCodePoint(number) : "";
  });
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => escapeText(text).replace(/"/g, "&quot;");

function readAttributes(source: string): [string, string][] {
  const found: [string, string][] = [];
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) found.push([match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ""]);
  return found;
}

function cleanAttributes(source: string): Map<string, string> {
  const kept = new Map<string, string>();
  for (const [name, raw] of readAttributes(source)) {
    if (name === "style") {
      for (const declaration of decodeBasic(raw).split(";")) {
        const [property, ...rest] = declaration.split(":");
        const key = property?.trim().toLowerCase();
        if (!key || !STYLE_PROPERTIES.has(key)) continue;
        const value = cleanValue(key, rest.join(":").replace(/!important/i, ""));
        if (value !== null) kept.set(key, value); // style wins over the attribute, as in a browser
      }
      continue;
    }
    if (!ATTRIBUTES.has(name)) continue; // on*, href, xlink:*, xmlns:*, editor attributes…
    const value = cleanValue(name, raw);
    if (value !== null && !kept.has(name)) kept.set(name, value);
  }
  return kept;
}

const writeAttributes = (attributes: Map<string, string>) =>
  [...attributes].map(([name, value]) => ` ${CASED_ATTRIBUTES[name] ?? name}="${escapeAttribute(value)}"`).join("");

/**
 * The upload, rebuilt safely, or an SvgError saying (in plain words) what's
 * wrong. The result has one `<svg>` with a viewBox and only drawing inside.
 */
export function sanitiseSvg(input: string): string {
  if (input.length > SVG_MAX_LENGTH) throw new SvgError("That SVG is too big for an icon (over 200 KB). Simplify it, or save it as a plain SVG.");
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(input)) throw new SvgError("That SVG has parts that aren't allowed (a DOCTYPE, entities or CDATA). Save it as a plain SVG.");
  const text = input.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "");

  const out: string[] = [];
  const open: string[] = []; // elements written and still open
  let skipping = 0; // depth inside a dropped element
  let rootSeen = false;
  let rootClosed = false;
  let drawn = 0;
  const tag = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let last = 0;

  const writeText = (chunk: string) => {
    if (skipping || !chunk.trim()) return;
    const parent = open[open.length - 1];
    if (parent === "text" || parent === "tspan") out.push(escapeText(decodeBasic(chunk)));
  };

  for (const match of text.matchAll(tag)) {
    const between = text.slice(last, match.index);
    if (/[<>]/.test(between)) throw new SvgError("Couldn't read that SVG. Save it again as a plain SVG and try once more.");
    writeText(between);
    last = match.index! + match[0].length;
    const [, closing, rawName, attributeSource, selfClosing] = match;
    const name = rawName!.toLowerCase();
    if (rootClosed) continue; // anything after the icon is ignored

    if (closing) {
      if (skipping) {
        skipping--;
        continue;
      }
      if (!ELEMENTS.has(name)) continue; // a stray close of something dropped
      if (open[open.length - 1] !== name) throw new SvgError("Couldn't read that SVG (its tags don't match up). Save it again as a plain SVG.");
      open.pop();
      out.push(`</${CASED[name] ?? name}>`);
      if (!open.length) rootClosed = true;
      continue;
    }

    if (skipping) {
      if (!selfClosing) skipping++;
      continue;
    }
    if (!rootSeen) {
      if (name !== "svg") throw new SvgError("That isn't an SVG picture.");
      rootSeen = true;
      const attributes = cleanAttributes(attributeSource ?? "");
      if (!attributes.has("viewbox")) {
        const width = parseFloat(attributes.get("width") ?? "");
        const height = parseFloat(attributes.get("height") ?? "");
        if (!(width > 0 && height > 0)) throw new SvgError("That SVG has no size (no viewBox, width or height), so it can't be scaled to an icon.");
        attributes.set("viewbox", `0 0 ${width} ${height}`);
      }
      // It's drawn at icon size wherever it goes.
      attributes.delete("width");
      attributes.delete("height");
      attributes.delete("x");
      attributes.delete("y");
      out.push(`<svg xmlns="http://www.w3.org/2000/svg"${writeAttributes(attributes)}>`);
      if (selfClosing) {
        rootClosed = true;
        out.push("</svg>");
      } else open.push("svg");
      continue;
    }
    if (name.includes(":") || SKIPPED.has(name) || !ELEMENTS.has(name) || name === "svg") {
      if (!selfClosing) skipping = 1;
      continue;
    }
    if (!["defs", "g", "lineargradient", "radialgradient", "stop", "clippath", "mask", "tspan"].includes(name)) drawn++;
    const written = `<${CASED[name] ?? name}${writeAttributes(cleanAttributes(attributeSource ?? ""))}`;
    if (selfClosing) out.push(`${written}/>`);
    else {
      out.push(`${written}>`);
      open.push(name);
    }
  }
  if (/[<>]/.test(text.slice(last))) throw new SvgError("Couldn't read that SVG. Save it again as a plain SVG and try once more.");
  if (!rootSeen) throw new SvgError("That isn't an SVG picture.");
  // Close anything left open (some exporters are sloppy at the end).
  while (open.length) out.push(`</${CASED[open.pop()!] ?? "g"}>`);
  if (!drawn) throw new SvgError("That SVG has nothing in it that can be drawn.");
  return out.join("");
}

/**
 * The icon in one colour (a trade's ink), for SVGs set to "Use the trade's
 * colour": every fill and stroke that isn't "none" (or a gradient) becomes
 * `colour`, and the whole icon defaults to it.
 */
export function tintSvg(svg: string, colour: string): string {
  if (!/^#[0-9a-f]{3,8}$/i.test(colour)) return svg;
  const recoloured = svg.replace(/ (fill|stroke|stop-color)="([^"]*)"/g, (whole, name: string, value: string) => (value === "none" || value.startsWith("url(") ? whole : ` ${name}="${colour}"`));
  const root = /^<svg[^>]*>/.exec(recoloured)?.[0] ?? "";
  return / fill="/.test(root) ? recoloured : recoloured.replace(/^<svg /, `<svg fill="${colour}" `);
}

/** For `<img src>` and SVG `<image href>`. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
