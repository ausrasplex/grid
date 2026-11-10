# Document & Email Templates block: agreed design

Status: **basics built** (phase 3a): `DocTheme` (logo, accent colour, business details, licence, footer) under Settings › Branding with a sample PDF; `DocShell` document frame; `renderPdf` (puppeteer-core + Chromium in the image, JavaScript off, no network, only `data:` URLs). The template editor below is still to come.

> **Words:** in this doc a **Block** (capital B) is a Grid feature package (Quotes, Photos…). The drag-and-drop pieces a template is built from are **elements** (heading, rich text, photo grid…), so the two never get mixed up. Block id `templates`, depends on `companies`. **Required (core) block**: always on, because any block that produces a PDF or branded document relies on it.
Build it just before the first block that needs it (Quotes, phase 3); it can ship earlier with the theme only.

## Why its own block

The template designer has its own settings pages, tables, permissions and a background render job. Quotes, variations, progress claims, reports, SWMS, inspection forms, asset tag sheets and future invoices all need branded documents. One block means **one theme, one editor and one renderer** for the whole company, and a new block gets branded PDFs by registering a document type instead of building its own.

## Extension point: document types

Blocks contribute **document types** through their manifest, the same way they contribute menus and permissions. Core gains a new manifest field:

```ts
// blocks/quotes/block.ts
documentTypes: [
  {
    id: "quotes.quote",                 // "<block>.<name>"
    name: "Quote",
    placeholders: () => import("./doc/placeholders"),   // groups + descriptions + sample values
    elements: () => import("./doc/elements"),           // elements only this Block understands, e.g. line items table
    data: () => import("./doc/data"),                   // loads real data for a record id, permission-checked
    starters: () => import("./doc/starters"),           // starter templates to copy from
    permission: "quotes.view",                          // needed to render a real record
  },
],
```

- **Placeholders**: name, group, description, sample value, type (text, date, money, image). Shared groups (`company`, `page`, `today`) come from the templates block itself; blocks add their own (`quote`, `client`, `variation`, `asset` …).
- **Elements**: generic elements come from the templates block; other Blocks add data elements only they understand (quote line items, variation cost breakdown, inspection checklist results, asset QR sheet).
- **Data loader**: given a record id and the request context, returns the placeholder values and element data. Enforces the block's own permissions, so templates never become a way to read data you can't otherwise see.
- **Starter templates**: shipped with the block so companies don't start from a blank page.
- The registry validates document types like other contributions (ids prefixed with the block id, no duplicates). If a block is switched off for a company, its document types disappear from the editor, but saved templates are kept.

## Report templates (photos, and later site diaries and inspections)

Reports are document types too, so a company can design its own instead of the built-in photo report. The photos Block registers:

- **Document type `photos.report`.** Placeholders: `job`, `site`, `client`, plus `report_title`, `report_date`, `prepared_by` and `photo_count`.
- **Photo grid element**, the heart of it. Options:
  - **Which photos:** all, Before only, After only, or Before and After.
  - **Filters:** an area (building / level), a date range, or photos ticked by hand when the report is made.
  - **Layout:** photos per row (1–4), size, landscape or square crop.
  - **Grouping:** by area, by tag (Before, then After), by day, or Before/After pairs side by side.
  - **Under each photo:** caption, area, date and time, who took it (each can be turned off).
- **Notes element:** the job's notes for the same filter, as a list.
- **Starter templates:** "Photo report" (today's built-in layout), "Customer handover" (cover page, Before/After pairs, sign-off), "CES evidence" (job and address details, test-result photos in a grid) and "Defect report" (one photo per row with a large caption).

Making a report: on a job, **Report** → pick a template (the company default is preselected) → adjust the filters → preview → **Save PDF** or **Email to customer**. A sent report is a snapshot (see Versions and snapshots), so it never changes afterwards, even if photos are later edited.

Until the templates Block exists, the photos Block keeps today's fixed report page; that becomes the "Photo report" starter.

## What the block provides

### Company theme (one per company)

- Logos (light/dark), primary and accent colours, fonts (curated list, embedded), page size (A4 default; Letter), margins, orientation.
- Default header and footer (logo, company details, `{page} of {pages}`, registration number using the company's label, e.g. ABN / VAT No.).
- Every document type inherits the theme; templates can override parts of it.

### Template editor

- Drag-and-drop elements with **live preview** using sample data or a real record (desktop/tablet; read-only preview on phones).
- **Generic elements:** heading/cover, company details, rich text, image, divider, spacer, page break, two-column container, signature/acceptance, appendix PDF.
- **Elements from Blocks:** whatever the document type registers (e.g. line items table, totals with tax breakdown).
- Simple style controls per element (theme colours, alignment, spacing, borders, font size).
- Element visibility rule: "Show only when {placeholder} is not empty".

### Element options

Drag-and-drop only: owners never write code. Colours default to the company theme, with a custom picker; every option stays within limits that keep output readable and working in every email client.

**Common options (every element):**

| Group | Options |
|---|---|
| Colours | Text colour, background colour (theme swatches or custom hex), **contrast warning** below 4.5:1 |
| Spacing | Padding (all sides linked, or top/right/bottom/left), space above/below |
| Border | Width, style (solid/dashed/dotted), colour, sides, **corner radius** |
| Size | Width (full or % of row), max width, min height |
| Alignment | Left/centre/right; vertical alignment inside columns |
| Visibility | Show only when a placeholder has a value; mobile/desktop/both (emails); PDF only / online view only (documents) |
| Shadow | None / subtle / medium (presets only) |

**Text options** (text, heading, details, footer elements): font (from theme fonts), size (preset scale), weight, italic, underline, line height, letter spacing, text transform, link colour/underline; inline bold/colour, lists, quotes.

**Element-specific options:**

| Element | Extra options |
|---|---|
| Heading | Level H1–H3, optional accent line |
| Image / logo | Image or logo slot, size, crop shape (square/rounded/circle), alt text (required), link |
| Button | Label, link (record link or URL), filled/outline, size, full width on mobile |
| Table (line items, details) | Columns, column widths, header style, striped rows, row/cell borders, number alignment, repeat header on new PDF pages |
| Totals | Lines shown, total highlight style, tax breakdown on/off |
| Columns | 2 or 3, ratio (50/50, 33/67, …), gap, **stack on mobile** |
| Divider | Thickness, style, colour, width |
| Spacer | Height |
| Signature | Lines (name/signature/date), labels |
| Background section | Full-width coloured band behind grouped elements; image background (PDF only) |

Elements registered by a Block declare which common options they support plus their own.

**Template-wide:** page background, content width, page margins (PDF), default font and colours, inherited from the theme and overridable per template.

**Email limits (editor shows a "limited in some email apps" note on these):**
- Corner radius renders square in Outlook desktop; design still works.
- Background images: PDF only.
- Custom fonts fall back to a safe font where unsupported.
- Shadows: PDF and online view only.

**Storage:** options are saved as structured values from fixed lists and ranges (validated server-side), never as raw CSS, consistent with the Safety rules.

**Editor libraries:** dnd-kit (element drag-and-drop), TipTap (rich text with placeholder chips, `{` to insert), MJML (email output), Puppeteer (PDF output).

### Placeholders

- Owner-friendly `{company_name}` syntax plus a **placeholder picker** (search + insert, with descriptions and sample values).
- Unknown placeholders highlighted and listed as warnings before saving.
- Fallbacks: `{client_contact_name|Sir/Madam}`.
- Formatting filters: `{quote_date|date:"d MMM yyyy"}`, `{quote_total|currency}`, `{client_name|upper}`.
- Shared placeholders from this block: `{company_name}`, `{company_abn}`, `{company_registration_label}`, `{company_address}`, `{company_phone}`, `{company_email}`, `{company_website}`, `{company_logo}`, `{page}`, `{pages}`, `{today}`, `{generated_by_name}`.

### Multiple templates and defaults

- Several templates per document type (e.g. "Builder tender", "Homeowner quote").
- Default per document type; blocks can let a record or client choose its own (e.g. `Client.preferredTemplateId`).

### Versions and snapshots

- Templates are versioned; editing creates a new version.
- **Rendering for something that's sent or signed stores the template version and the output PDF**, so it never changes afterwards. Blocks call `render(..., { snapshot: true })` and keep the returned file key.

### Rendering service

- Templates are JSON (theme + elements). The worker renders **JSON → HTML → PDF with Puppeteer**, fonts embedded, as a pg-boss job.
- The same HTML powers **online views** (e.g. the client's quote link), so web and PDF match.
- API for blocks: `render({ docType, recordId, templateId?, format: "pdf" | "html", snapshot? })`.
- The same theme and placeholders drive **email templates** (see Email templates below).

### Safety

- No raw HTML, CSS or scripts from users: elements and style options only; rich text sanitised to an allow-list.
- Placeholder values escaped on insert.
- Images uploaded through storage (type/size checked), never external URLs.
- Puppeteer runs in the worker with network access disabled during rendering.
- Data loaders enforce permissions, so a template preview can't expose records the user can't see.

## Email templates

Emails are a second **kind** of template in this block, sharing the company theme, placeholders, editor and permissions with documents. Emails have different rules (email clients are fussy, subjects matter, a plain-text version is needed), so they get their own element set and renderer.

### Extension point: email types

Blocks register **email types** alongside document types:

```ts
// blocks/quotes/block.ts
emailTypes: [
  {
    id: "quotes.sent",                       // "<block>.<name>"
    name: "Quote sent to client",
    audience: "external",                    // "internal" (staff) | "external" (clients, other companies)
    placeholders: () => import("./email/placeholders"),
    data: () => import("./email/data"),      // values for a specific event, permission-checked
    defaults: () => import("./email/defaults"), // default subject + elements
    attachments: ["quotes.quote"],           // document types that can be attached (PDF rendered via templates)
  },
],
```

Examples of email types blocks will register:

| Block | Email types |
|---|---|
| companies | member invited, invite accepted, removed |
| projects | company invited to project, access request (QR) to approve, placement to confirm |
| quotes | quote sent, reminder before expiry, quote viewed (internal), accepted/declined (internal), draft submitted for review (internal) |
| variations | variation submitted, approved, rejected |
| rfis | RFI raised, answered, closed |
| assets | fault reported, inspection due/overdue, asset found (lost-and-found) |
| inductions | induction expiring, credential request to approve, compliance item expiring |
| notifications | daily digest |

### What an owner can edit

- **Subject line** with placeholders, e.g. `Quote {quote_number} from {company_name}: {quote_title}`.
- **Preview text** (the grey line shown after the subject in most inboxes).
- **Body elements** (email-safe set): header with logo, heading, rich text with placeholders, **button** (link to the record, e.g. "View quote"), summary card (key facts from the record), details table, image, divider, footer.
- **Sender details per email type:** From name (e.g. `{company_name}` or `{prepared_by_name} at {company_name}`), **Reply-To** (e.g. the estimator who prepared the quote), optional **CC/BCC** (e.g. BCC the office on every quote sent).
- **Attachments:** automatically attach the record's PDF (e.g. the quote PDF from its document template), on or off per email type.
- **On/off per email type** for company-sent emails (e.g. turn off "quote reminder" emails).

### What owners can't edit

- **System emails** (sign-in links, password reset, email verification, security alerts, "your email address was changed") use **platform-controlled templates**. Companies can't edit them, which stops phishing-style changes and keeps sign-in emails trustworthy. On the hosted site, the platform admin brands them; on a self-hosted server, the Super Admin does.
- **Required content** is always added: the company's name and contact details in the footer, and for staff emails a link to **notification preferences**. Users' own notification preferences (stage 6) always decide whether a notification email is sent to them; a company template can't override them.

### Email layouts (shared header and footer)

**One place edits every email.** A company's emails are built from a **layout** (header + footer + outer styling) wrapped around each email type's body.

- **Layout = header elements + footer elements + frame** (background colour, content width, padding, fonts from the theme).
- Default layout is created from the company theme: logo header; footer with company name, address, phone, website, registration number, and social links if set.
- **Every email template uses a layout**; editing the layout updates **all** emails that use it immediately (new sends only; already-sent emails stay as they were).
- **Multiple layouts** allowed, e.g. **"Standard"** (full branding, for clients and other companies) and **"Internal"** (slim header, for staff notifications). Each email type picks one; block defaults suggest Standard for external and Internal for staff emails.
- Email templates only edit the **body** between header and footer; the editor shows the layout around it, greyed out, with "Edit layout" to jump there.
- **Required content** (company name and contact details; for staff emails, the notification-preferences link) lives in the layout and **must be present and visible before the layout can be saved** (see Required content check below).
- Layouts use the same placeholders (company group, plus `{recipient_name}`, `{today}`).
- Versioned like templates; each sent email logs the layout version as well as the template version.
- **Documents work the same way:** the document theme's header and footer act as the shared layout for every PDF; a document template can opt out on specific pages (e.g. a full-bleed cover page).

#### Required content check

Required items are **locked elements**: they can be moved anywhere in the header or footer, restyled, placed in columns, and surrounded by the company's own text, but **not deleted**. The layout **can't be saved unless every required item is present and visible**.

**Required items:**

| Item | Applies to | Satisfied by |
|---|---|---|
| Company name | all company emails | locked element, or `{company_name}` in text |
| Company contact (phone or email) | all company emails | locked element, or `{company_phone}` / `{company_email}` in text |
| Company address | external emails | locked element, or `{company_address}` in text |
| Notification-preferences link | internal (staff) emails | locked link element only (must link to the preferences page) |

The platform can add required items later (e.g. for a new jurisdiction) without code changes in blocks.

**Editor:**
- Locked elements show a lock icon; drag, restyle and edit surrounding text freely, but the delete action is disabled.
- A **"Required content" checklist** beside the editor ticks off live as each item is satisfied.

**Save validation (server-side, can't be bypassed by the client):**
The layout is test-rendered with the company's real data, for both an internal and an external sample email, and each required item must:
1. **Appear in the rendered output**: the actual value (e.g. the phone number) is found, not just a placeholder name.
2. **Not be hidden**: not inside a "show only when…" condition that could evaluate empty; not zero-size, transparent, `display:none`, or clipped.
3. **Be readable**: at least 11px text and a contrast ratio of at least 4.5:1 against its background (catches white-on-white and tiny text).
4. **Work as a link** where required: the preferences link resolves to the app's preferences URL.

Failures block saving with a specific message, e.g. "Company phone number is missing from the footer" or "Preferences link text is too light to read (contrast 1.8:1, needs 4.5:1)".

**Send-time safety net:**
- Every email is re-checked just before sending. If a required item is missing (e.g. the company later cleared its phone number in settings), a plain fallback line with the missing details is appended to that email, the email still sends, and the owner gets a notification to fix the layout or settings.
- Same rule for document templates where a document type declares required items (e.g. registration number and tax label on quotes, where jurisdictions require them).

Data model additions: `EmailLayout` (`companyId`, `name`, `isDefault`, `currentVersionId`), `EmailLayoutVersion` (`layoutId`, `header Json`, `footer Json`, `frame Json`, `createdById`, `createdAt`); `EmailTemplate` gains `layoutId`; `EmailLog` gains `layoutVersionId`.

### Rendering

- Email JSON → **MJML** → email-safe HTML (works across Outlook, Gmail, Apple Mail; inline styles, table layout, dark-mode friendly).
- A **plain-text version** is generated automatically from the same elements.
- Logo/images: served from the app's public asset URL (or embedded as inline attachments on servers that aren't publicly reachable).
- **No open-tracking pixels** (decided). Pixel tracking is unreliable (Apple Mail preloads images → false opens; Outlook/corporate filters block images → missed opens), costs recipients' privacy, and can hurt deliverability.
- **Link-open tracking instead:** the email's main button links to the record through the app; opening it is recorded against the record (e.g. quote **Viewed**, invite **Opened**) and shown in the email log as "Link opened" with a time. Accurate because it's real activity.
- Possible later: pixel tracking as an **off-by-default** company setting, labelled "approximate".
- Sending goes through the stage 6 email pipeline: company SMTP or system fallback, rate limits, retries, bounce handling.

### Editor

- Same drag-and-drop editor as documents, with an email element set and a **mobile/desktop preview toggle**, plus a **dark-mode preview**.
- **Send a test email to myself** using sample or real data.
- Placeholder picker, unknown-placeholder warnings, fallbacks and formatting filters work exactly as for documents.
- **Reset to default** per email type.
- If a company template fails to render (e.g. after a block update removes a placeholder), the email falls back to the block's default template and the owner is notified.

### Versions

- Email templates are versioned like documents. Each sent email records the template version used, plus subject, recipients and time (in the email log), for audit and "what did we send them?" questions. The email body itself isn't stored long-term unless it's a client-facing record email (e.g. quote sent), which keeps a copy alongside the quote revision.

### Compliance

- Everything sent is **transactional** (about a record or action the recipient is involved in). Marketing emails aren't part of this design; if ever added, they'd need consent and an unsubscribe link (Australian Spam Act).

### Permissions

- `templates.emails.manage`: edit company email templates and sender settings (Owner; Estimator for quote emails)
- `platform.emails.manage`: system email templates (Super Admin)

### Data model additions

- `EmailTemplate`: `companyId` (null = platform/system), `emailType`, `name`, `enabled`, `currentVersionId`.
- `EmailTemplateVersion`: `templateId`, `subject`, `preheader`, `elements Json`, `sender Json` (fromName, replyTo, cc, bcc), `attachDocTypes String[]`, `createdById`, `createdAt`.
- `EmailLog`: `companyId?`, `emailType`, `templateVersionId`, `layoutVersionId`, `to`, `cc`, `subject`, `recordType?`, `recordId?`, `status` (`QUEUED | SENT | BOUNCED | FAILED`), `sentAt`, `linkOpenedAt?`, `error?`.

### Core change needed

Add `emailTypes?: EmailTypeDef[]` to `BlockDefinition` alongside `documentTypes`; the registry validates and exposes `emailTypes()` filtered by enabled blocks.

### Build order

E1. Platform system emails (sign-in, verification) with built-in templates; email pipeline from stage 6.
E2. Email type registration; block defaults for the first notifications.
E3. Email layouts (shared header/footer) + company email editor: subject, preheader, body elements, sender settings, test send, previews.
E4. Attachments from document templates; email log; per-type on/off.

## Permissions

- `templates.theme.manage`: company theme (Owner)
- `templates.manage`: create/edit templates for any document type the user can access (Owner; Estimator for quote types)
- `templates.view`: see templates and preview with sample data
- Rendering a real record also needs the document type's own `permission`.

## Menus

- `settings.company`: "Branding" (theme), "Document templates" and "Email templates" (each grouped by type, from every enabled block)

## Data model

- `DocTheme`: `companyId` (1:1), `logoKey`, `logoDarkKey?`, `colors Json`, `fonts Json`, `pageSize`, `margins Json`, `header Json`, `footer Json`.
- `DocTemplate`: `companyId`, `docType` (e.g. `quotes.quote`), `name`, `isDefault`, `currentVersionId`, `deletedAt`.
- `DocTemplateVersion`: `templateId`, `elements Json`, `themeOverrides Json?`, `createdById`, `createdAt`.
- `RenderedDocument`: `companyId`, `docType`, `recordId`, `templateVersionId`, `fileKey`, `format`, `renderedAt`, `renderedById` (written for snapshots).

## Core change needed

`packages/core/src/block.ts`: add `documentTypes?: DocumentTypeDef[]` to `BlockDefinition`; the registry validates ids and exposes `documentTypes()` (filtered by enabled blocks), like `menusFor`.

## Build order

1. Theme + render service (Puppeteer job) + generic elements + shared placeholders.
2. Document-type registration in core; first consumer: quotes.
3. Template editor with live preview, placeholder picker, warnings.
4. Multiple templates, defaults, versioning and snapshots.
5. Further consumers: photo reports (`photos.report`), variations, SWMS, asset tag sheets; email templates.
