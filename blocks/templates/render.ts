// HTML → PDF with headless Chromium (puppeteer-core). One browser is kept
// open and shared; each document gets its own page. In the Docker image
// Chromium is at /usr/bin/chromium-browser (CHROMIUM_PATH overrides).

import "server-only";
import puppeteer, { type Browser } from "puppeteer-core";
import type { ReactElement } from "react";
/**
 * A document component (DocShell…) as a complete HTML page. react-dom/server
 * is loaded when needed: Next won't let app code import it statically.
 */
export async function toHtml(doc: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return "<!doctype html>" + renderToStaticMarkup(doc);
}

let browser: Promise<Browser> | null = null;

function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    headless: true,
    // The container has no user namespaces for Chromium's sandbox; it only
    // ever renders Grid's own HTML, with JavaScript off and no network.
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = launch();
    browser.then((launched) => launched.on("disconnected", () => (browser = null))).catch(() => (browser = null));
  }
  return browser;
}

export interface PdfOptions {
  /** Small grey text in each page's footer, left side (page numbers go on the right). */
  footer?: string;
}

export async function renderPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const pdfBrowser = await getBrowser();
  const page = await pdfBrowser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    // Only data: URLs (embedded logo, photos): nothing is fetched from anywhere.
    await page.setRequestInterception(true);
    page.on("request", (event) => (event.url().startsWith("data:") ? event.continue() : event.abort()));
    await page.setContent(html, { waitUntil: "load" });
    const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:8px;color:#6b7280;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>${escapeHtml(options.footer ?? "")}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
