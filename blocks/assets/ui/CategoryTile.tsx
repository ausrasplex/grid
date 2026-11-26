"use client";

// An asset's square (Docket's CoverTile): its photo when it has one,
// otherwise its category's picture on the category's colour. Used
// everywhere an asset is listed, so the same thing always looks the same.
// Also CopyText: a model or serial number that copies itself when tapped.
import { useRef, useState } from "react";
import {
  Anchor,
  BatteryCharging,
  Cable,
  Camera,
  Check,
  Construction,
  Container,
  Copy,
  Drill,
  Droplets,
  Flame,
  Forklift,
  Fuel,
  Gauge,
  Hammer,
  HardHat,
  Laptop,
  Lock,
  Package,
  PaintRoller,
  Plug,
  Puzzle,
  Ruler,
  Shovel,
  Snowflake,
  Thermometer,
  TrafficCone,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@grid/ui";
import { photoUrl } from "./shared";

export const ICON_COMPONENTS: Record<string, LucideIcon> = {
  drill: Drill,
  hammer: Hammer,
  wrench: Wrench,
  construction: Construction,
  forklift: Forklift,
  anchor: Anchor,
  plug: Plug,
  cable: Cable,
  zap: Zap,
  gauge: Gauge,
  thermometer: Thermometer,
  "battery-charging": BatteryCharging,
  fuel: Fuel,
  snowflake: Snowflake,
  droplets: Droplets,
  flame: Flame,
  camera: Camera,
  laptop: Laptop,
  lock: Lock,
  "hard-hat": HardHat,
  ruler: Ruler,
  "paint-roller": PaintRoller,
  shovel: Shovel,
  "traffic-cone": TrafficCone,
  truck: Truck,
  container: Container,
  package: Package,
};

/** The three tile colours (Docket's a1/a2/a3 in the Soft look), picked from the icon so a category keeps its colour. */
const TONES = ["bg-tile-1", "bg-tile-2", "bg-tile-3"];
const toneFor = (key: string) => TONES[[...key].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % TONES.length]!;

export function CategoryTile({ icon, photoFileId, piece, className }: { icon: string | null; photoFileId?: string | null; piece?: boolean; className?: string }) {
  const box = cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl", className);
  // eslint-disable-next-line @next/next/no-img-element
  if (photoFileId) return <img src={photoUrl(photoFileId, "thumb")} alt="" className={cn(box, "bg-muted object-cover")} />;
  const Icon = piece ? Puzzle : (ICON_COMPONENTS[icon ?? "wrench"] ?? Wrench);
  return (
    <span aria-hidden className={cn(box, piece ? "bg-muted" : icon ? toneFor(icon) : "bg-muted", "text-tile-foreground")}>
      <Icon className="size-1/2" />
    </span>
  );
}

/** navigator.clipboard needs https (or localhost); on a plain-http address fall back to the old copy command. */
async function copy(text: string) {
  if (window.isSecureContext && navigator.clipboard) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  area.select();
  const done = document.execCommand("copy");
  area.remove();
  if (!done) throw new Error("copy failed");
}

/** A value (model, serial) that copies itself when tapped, with a copy icon beside it (Docket's CopyText). */
export function CopyText({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const Icon = copied === "yes" ? Check : Copy;
  return (
    <button
      type="button"
      title={`Copy the ${label.toLowerCase()}`}
      aria-label={`${value}. Copy the ${label.toLowerCase()}`}
      onClick={async () => {
        try {
          await copy(value);
          setCopied("yes");
        } catch {
          setCopied("no");
        }
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 1500);
      }}
      className="group -my-1 inline-flex min-h-touch max-w-full items-center gap-1.5 rounded-md text-left hover:text-foreground"
    >
      <span className="min-w-0 break-all">{value}</span>
      <Icon className={cn("size-3.5 shrink-0", copied === "yes" ? "text-success" : "text-muted-foreground")} />
      {copied && (
        <span role="status" className="text-xs font-semibold text-muted-foreground">
          {copied === "yes" ? "Copied" : "Couldn't copy"}
        </span>
      )}
    </button>
  );
}
