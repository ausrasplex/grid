"use client";

/**
 * Fetches a file from Grid and hands it to the phone's Share menu (text,
 * WhatsApp, email, AirDrop…), or downloads it where there's no Share menu
 * (most computers). Returns false if the person closed the Share menu.
 */
export async function shareFile(address: string, fallbackName: string): Promise<boolean> {
  const response = await fetch(address, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Couldn't get the file");
  }
  const blob = await response.blob();
  // The server's name for it ("Steve Serci.vcf"), else ours.
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const name = encodedName ? decodeURIComponent(encodedName) : fallbackName;
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name.replace(/\.[^.]+$/, "") });
      return true;
    } catch (error) {
      if ((error as Error).name === "AbortError") return false;
      // Some browsers refuse a share they said they could do: download instead.
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return true;
}
