// App icons, served at /icon/<id> and made from public/icon.png:
//   32, 96    browser tab, and the Grid mark in the menus and on sign-in (cropped close)
//   192, 512  the installed app (manifest.ts); 512 is Android's maskable icon too

import { appIconPng } from "@/lib/app-icon";

const ICONS = {
  "32": { size: 32, tight: true },
  "96": { size: 96, tight: true },
  "192": { size: 192, tight: false },
  "512": { size: 512, tight: false },
} as const;
type IconId = keyof typeof ICONS;

export function generateImageMetadata() {
  return (Object.keys(ICONS) as IconId[]).map((id) => ({ id, size: { width: ICONS[id].size, height: ICONS[id].size }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const icon = ICONS[(await id) as IconId] ?? ICONS["192"];
  return appIconPng(icon.size, { tight: icon.tight });
}
