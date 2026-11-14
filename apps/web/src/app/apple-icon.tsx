// iPhone and iPad home-screen icon (Share › Add to Home Screen), made from
// public/icon.png. iOS rounds the corners itself.

import { appIconPng } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIconPng(180);
}
