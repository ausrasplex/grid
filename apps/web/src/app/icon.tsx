// App icons, served at /icon/<id>: the browser tab, the installed app
// (manifest.ts) and Android's cropped "maskable" icon.

import { appIcon } from "@/lib/app-icon";

const ICONS = {
  "32": { size: 32, maskable: false },
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "maskable-512": { size: 512, maskable: true },
} as const;
type IconId = keyof typeof ICONS;

export function generateImageMetadata() {
  return (Object.keys(ICONS) as IconId[]).map((id) => ({ id, size: { width: ICONS[id].size, height: ICONS[id].size }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const icon = ICONS[(await id) as IconId] ?? ICONS["192"];
  return appIcon(icon.size, { maskable: icon.maskable, rounded: !icon.maskable && icon.size > 32 });
}
