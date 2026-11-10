# Quotations block: agreed design

Status: **3a built** (November 2026): tax & currency settings, clients, price book, quick quote on the phone, PDF with your branding, send by email or by hand, revisions (Rev A, B…), accept → job, decline, withdraw. **3b built** (November 2026): customer link, one-time code, drawn/typed signature, chosen extras, sealed signed PDF with a certificate page, verify page, decline online. Block id `quotes`, depends on `projects`, `templates` and `signatures`.

### What 3a built (and decided)

- **Money** is whole cents in `blocks/quotes/money.ts` (`calculate`, `groupBySection`, `formatMoney`), unit-tested and shared by the server and the editor for live totals. Quantities to 3 decimals. Tax rounding per line or per total (setting). Price book prices are always ex tax; picking one on a quote typed incl. tax converts it.
- **Statuses now:** `DRAFT → SENT → ACCEPTED | DECLINED | WITHDRAWN` (`EXPIRED` is stored-ready; the list flags "Past valid date"). Foreman review (`SUBMITTED`…) waits for teams.
- **Revisions:** sending freezes the quote into a `QuoteRevision` with a JSON snapshot (lines, client, totals, tax settings, ABN, who prepared it) and its PDF (`StoredFile`, block `quotes`). The PDF is only ever rendered from the snapshot, so later changes to settings or branding never change a sent quote. **Edit** on a sent quote reopens it as a draft; the next send is Rev B.
- **Sending:** "Email it" (needs Settings › Email; PDF attached, Reply-To is the person who sent it) or "I'll send it" (marks sent; download the PDF). A draft's PDF preview carries a DRAFT watermark.
- **Accepted** is recorded by staff ("Customer accepted", with how). It makes the job at the quote's site address with references `Job no.` and `Quote = Q-1001`, unless the quote was for an existing job. The job page shows the quote (panel `job.area`).
- **Costs and margin** only reach people with `quotes.costs.view` (stripped server-side). Repeated taps on the same price-book item add to its quantity.
- **Sections** group lines on screen and on the PDF in the order each section first appears ("Other" for lines without one). Optional extras are listed separately and are never in the total.
- **Permissions:** `quotes.view`, `.create`, `.send`, `.costs.view`, `.pricebook.manage`, `.clients.manage`, `.settings.manage`. Owner has all; Foreman gets view/create for now.
- **Pages:** `/b/quotes` (list), `/b/quotes/new[/<jobId>]`, `/b/quotes/<id>`, `/b/quotes/price-book`, `/b/quotes/clients`, `/b/quotes/settings`. API at `/api/quotes/...` (see `routes.ts`).
Requires: `templates` (core block, PDFs and online quote view). Uses (when on): `projects` (accepted quotes create/join projects), plans + markups + measurement (take-offs), `variations` (accepted quote is the baseline), `documents` (attachments), stage 6 email/notifications.
Suggested placement: after stage 4 (markups), so take-offs work; quick quotes don't need plans and can ship earlier.

### What 3b built (and decided)

- **`signatures` core block** (required): `SignRequest` (one per sent revision with a link) and `SignatureEvent` (append-only trail with IP and device). It owns the link token (stored hashed, plus encrypted so the business can copy it again), one-time codes (6 digits, 10 minutes, 5 tries, 5 codes an hour), sealing (`seal.ts`: PAdES `ETSI.CAdES.detached` with node-forge + @signpdf; a self-signed "Grid document seal" certificate made on first use, kept in `ServerSetting` "signing" encrypted with `APP_ENCRYPTION_KEY`), the certificate page component and `/verify`.
- **Public pages and API** are a new core extension point: a block's `publicRoutes` (manifest, at `/api/public/<block>/...`) and `publicPages` (ui export, at `/p/<block>/...`). No session is read. `/q/<token>` and `/verify/<code>` are rewrites. Public pages use the light "paper" theme, are never indexed and send no referrer.
- **Sending** makes the link when online acceptance is on (Settings › Tax & currency › Accepting online), email is set up and there's an address for codes: the address it was emailed to, or the client's email when you send it yourself (then copy the link from the quote). Sending a new revision, recording an answer, reopening or withdrawing stops older links working.
- **The customer page** shows the sent revision (never live data), lets them tick optional extras (live total), then: email me a code → enter it → name (and position/business) → draw or type a signature (Caveat font) → two consent ticks with the terms shown → **Sign and accept**. Or **Decline** with an optional reason.
- **On signing:** the signed PDF is the revision re-rendered with the acceptance box (signature image, name, time, chosen extras included in the total) plus the signing certificate page, then sealed. Stored in `SignRequest.signedPdfFileId`; `signedSha256` is what `/verify` compares. The quote becomes `ACCEPTED` (`acceptedHow` `SIGNED_ONLINE`, `acceptedOptions`), the job is made (acting as whoever sent the quote; a failure is noted on the quote but never loses the signature), the customer gets the signed PDF, and whoever sent the quote gets an email with it.
- **Business side:** "Viewed" badge once opened, Copy link, Signed PDF button, verify code, agreed total with extras. "Customer accepted/declined" became **Record acceptance / Record decline** for answers given another way.
- **Verify page** shows only match / no match and the signing date; uploading a PDF compares its SHA-256 (the file isn't kept).
- **Not yet (later phases):** signing in person on the tradie's device, several signers, purchase order numbers, questions from the customer page, reminders, SMS codes, uploading evidence with a recorded acceptance, a company's own sealing certificate, RFC 3161 timestamps.

## Decisions

- **Estimator is a built-in role**, alongside Owner, Foreman, Employee and Viewer (§9).
- **Tax is configurable per company** (name, rates, inclusive/exclusive, registration label, currency); nothing is hard-coded to GST (§3a).
- **Both kinds of client:** builders (multi-level commercial jobs, plan take-offs) **and** homeowners/small jobs (fast mobile quotes). Two creation modes, one quote model (§3).
- **Foremen can draft quotes on site.** They submit for review; an Owner or Estimator reviews, can edit, and is the one who sends (§4).

## Who sees pricing

- Financial block: **hidden from everyone by default** except Owners and the optional **Estimator** role.
- Foremen see only quotes they drafted, and only the fields the company allows (cost/margin hidden from them by default).
- Pricing never flows up or down the contract chain except to the party being quoted.

## 1. Clients

- A quote goes to a **client**: a company already on the app (e.g. a builder) or an external contact (homeowner, property manager, strata).
- Client record: name, contacts, billing/site addresses, ABN (business clients), default terms, quote history, win rate.
- Clients on the app receive quotes in-app; external clients receive a secure link + PDF.

## 2. Price book

- **Labour rates:** standard, overtime, apprentice, after-hours call-out; per hour.
- **Materials:** cost price, supplier, unit, sell price or markup %, supplier code.
- **Assemblies (kits):** priced bundles of materials + labour, e.g. "Double GPO installed" = GPO + mounting block + 3 m cable allowance + 0.5 h labour. Nested assemblies allowed.
- **Supplier price list import (CSV):** map columns once per supplier; bulk-update costs. Assemblies recalculate; quotes in Draft can opt to refresh prices, sent quotes keep their prices.
- **Price history** per item, so you can see when and how costs changed.
- **Markup icons link to assemblies:** e.g. the "Double GPO" markup icon maps to the "Double GPO installed" assembly (used for take-offs, §3).

## 3. Building a quote

### Two creation modes

- **Quick quote (mobile, small jobs):** pick client → add assemblies/items from favourites or search → photos and notes → total. Built for a phone on site in a few minutes. Optional "good / better / best" options for homeowners.
- **Estimate (desktop/tablet, larger jobs):** sections, take-offs from plans, detailed margins.

### Structure

- **Sections:** e.g. Lighting, Power, Data, Switchboards, or by level.
- **Line items:** price book items, assemblies or one-off lines; quantity, unit, cost, sell, labour hours.
- **Options / alternates:** optional lines the client can tick on acceptance (e.g. "Add 6 downlights to alfresco").
- **Totals:** markup or margin per line, section or overall; discount; **tax per the company's tax settings (§3a)**; subtotals per section.
- **Text sections from templates:** inclusions, exclusions, assumptions, payment terms, validity period (default 30 days).
- **Attachments:** photos, plan extracts, data sheets (Documents block).

### 3a. Tax settings (company-configurable)

Owners set their own tax naming and rules in company settings; nothing is hard-coded to GST.

- **Tax name:** e.g. GST, VAT, Sales Tax, HST; shown on quotes, PDFs and totals ("GST (10%)", "VAT (20%)").
- **Tax codes (rates):** one or more, each with a name, rate and short label, e.g.
  - Australia: `GST 10%`, `GST-free 0%`
  - UK: `VAT standard 20%`, `VAT reduced 5%`, `Zero-rated 0%`, `Exempt`
- **Default tax code** for new lines; each **price item, assembly and quote line can carry its own tax code** (e.g. GST-free items).
- **Prices entered as tax-exclusive or tax-inclusive** (company default, overridable per quote, e.g. inclusive for homeowners, exclusive for builders).
- **Business registration label and number** printed on quotes: e.g. "ABN", "VAT No.", "GST No.", "EIN".
- **Currency and number format:** currency code/symbol and locale (e.g. AUD `$1,234.56`, GBP `£1,234.56`, EUR `1.234,56 €`).
- **Rounding:** per line or on the total (company setting).
- **"Tax invoice"/document wording** is configurable for jurisdictions that require specific titles.
- **Defaults from the company's country** at setup (Australia → GST, 10%, ABN, AUD, tax-exclusive for business clients), all editable.
- **Snapshotting:** every sent revision stores the tax name, codes, rates and inclusive/exclusive mode used, so changing settings later never alters a quote already sent or accepted.
- Totals show a **tax breakdown by code** when more than one rate is used.
- The same settings apply to variations and to the accounting export.

### Take-off from plans

- When the job's plans are in the app, **quantities come from markup icons and measurements**: e.g. 42 "Double GPO" icons on Level 2 → 42 × "Double GPO installed"; cable run measurements → metres.
- Take-off lines remember their source (sheet, revision, icon type, layer).
- **When a plan revision changes the counts**, the quote shows a "Take-off changed" banner with the differences, and you choose to update or keep.

### Internal vs client view

- **Internal:** cost, margin, labour hours, notes to self.
- **Client view, chosen per quote:** lump sum only, section totals, or fully itemised; show or hide quantities.

## 4. Foreman drafts → review → send

1. **Foreman** creates a quote (usually a quick quote on site), adds photos and notes, and taps **Submit for review**. Status: `SUBMITTED`. Foremen can't send to clients.
2. **Owners/Estimators are notified.** Reviewer opens it, can **edit anything** (prices, items, margin, text), add internal comments, or **return it to the Foreman** with notes (`CHANGES_REQUESTED`).
3. Reviewer **approves and sends** (`SENT`). The Foreman is notified that it went out, and of the outcome later.
4. Every edit by the reviewer is tracked (who changed what), visible internally.

Also available without Foremen: an Estimator draft can require Owner approval before sending (company setting).

## 5. Versions

- Each send creates a **revision** (Rev A, B, C …); earlier revisions are read-only.
- **Compare** any two revisions: added/removed/changed lines and total difference.
- Client sees only the latest sent revision (with history if the company allows).

## 6. Sending and acceptance

- Sent as a **PDF from the company's own template (§6a, Document Templates block)** + a **secure link** (unguessable, expires with the quote) showing the same design online.
- Client can view, **ask a question** (thread back to the company), tick options, and **accept by signing**. Signing is covered in full in §6b.
- Status: `DRAFT → SUBMITTED → CHANGES_REQUESTED → SENT → VIEWED → ACCEPTED | DECLINED | EXPIRED | WITHDRAWN`.
- Reminders: to the company when a quote has been viewed but not answered, and before expiry. Optional follow-up email to the client.
- Sending uses the company's own SMTP where set (stage 6).

### When accepted

- **Client is a company on the app with a project:** you're proposed into their project's contract chain under them, with the agreed scope and value (they confirm, per the stage 2 placement rules).
- **Otherwise:** a new project is created from the quote (client, site address, scope, accepted value).
- The accepted quote becomes the **contract baseline**: variations (stage 8) are priced from the same price book and linked back to it.
- Accepted value and selected options are locked; any later change is a variation.

## 6a. Editable PDF templates

Provided by the **Document Templates block** (`templates-block.md`), which quotes plug into by registering a document type:

- `quotes.quote`: the quote PDF and the client's online quote view.
- **Placeholders registered by quotes:** `{client_name}`, `{client_contact_name}`, `{client_email}`, `{client_phone}`, `{client_address}`, `{client_abn}`, `{quote_number}`, `{quote_revision}`, `{quote_title}`, `{quote_date}`, `{quote_valid_until}`, `{quote_site_address}`, `{quote_subtotal}`, `{quote_discount}`, `{quote_tax_total}`, `{quote_total}`, `{tax_name}`, `{currency}`, `{project_name}`, `{project_address}`, `{builder_name}`, `{prepared_by_name}`, `{prepared_by_phone}`, `{prepared_by_email}`, `{approved_by_name}`. (Company and page placeholders come from the templates block.)
- **Blocks registered by quotes:** line items table (columns, grouping by section, show/hide quantities, item photos; follows the quote's client view), options table, totals with tax breakdown by code, inclusions/exclusions/assumptions/terms, acceptance block (filled when signed online).
- **Starter templates:** "Builder tender" (formal, itemised by level), "Homeowner quote" (friendly, lump sum with photos), "Quick quote".
- **Choosing a template:** default per quote mode; `Client.preferredTemplateId`; changeable before sending.
- **Snapshots:** every sent revision stores `templateVersionId` and the rendered `pdfKey`, so sent and accepted quotes never change.

## 6b. Digital signatures on acceptance

Signing uses the shared **`signatures` core service** (see below), so variations, completion sign-offs and SWMS sign-ons can use the same flow later.

### Signing flow (client, on the secure link)

1. **Review:** the client reads the quote (the exact sent revision) and ticks any options. The total updates live.
2. **Confirm identity:** a 6-digit **one-time code** is sent to the email the quote was sent to, or by SMS if a mobile is on file. The client can't sign until it's entered. This ties the signature to that inbox or phone.
3. **Details:** full name, plus position and company when the client is a business. If a purchase order number is set as required, the client must enter it.
4. **Sign:** the client **draws** a signature (finger, mouse or stylus) or **types** their name, rendered in a signature font. The company chooses which of these are allowed.
5. **Agree:** two required ticks:
   - "I agree to sign electronically";
   - "I accept this quote, including the terms and selected options".

   The terms are shown in full (not just linked) before signing.
6. **Done:** a confirmation screen. Both the client and the company get an email with the **signed PDF** attached.

The client can **decline** instead, with an optional reason. The quote becomes `DECLINED` and the company is notified.

### What gets recorded (tamper-evident)

- **The exact document signed:** a SHA-256 hash of the rendered revision PDF *as shown to the client*, plus the revision ID, the options selected and the final total. The signature is bound to that hash.
- **Signer:** name, position/company, email or phone verified by one-time code, and the signature image (drawn or typed).
- **Audit trail**, with server timestamps for each event:
  - link opened and viewed;
  - code sent and verified;
  - options changed;
  - consent given;
  - signed or declined;
  - signed copy emailed.

  Each event records IP address and device/browser. Stored in `SignatureEvent`, which is append-only and never edited.
- **Signed PDF:**
  - the original quote with the acceptance block filled in (name, signature, date, selected options);
  - an appended **signing certificate page**: signer, verification method, timestamps, IP, document hash and a short verify code;
  - the whole file is then **digitally sealed** (PDF signature, PAdES), so Adobe Reader and similar show "signed and unaltered" and flag any later edit;
  - optionally an RFC 3161 trusted timestamp, if the company configures a timestamp service.
- **Verify page:** the short code on the certificate page (`/verify/XXXX-XXXX`) lets anyone holding the PDF check it matches the stored record. They upload the file, or the page confirms the hash.

### Other ways to accept

- **In person on a tablet:** "Sign on this device" hands the screen to the client in a locked signing view. They can't navigate away; the app returns to the Foreman after signing.
  - The one-time code still goes to the client's phone or email.
  - If they have neither, the Foreman confirms "Client identity sighted". This is recorded as the verification method.
  - Works **offline**: the signature is stored on the device and synced. Its timestamps are marked device time until the sync confirms them.
- **Several signers**, e.g. both homeowners, or a body corporate and a property manager:
  - the quote can need one or all listed signers, in any order or a set order;
  - it becomes `ACCEPTED` when the last required signer signs.
- **Recorded acceptance**, when the client accepted by email, phone or a signed paper copy:
  - an Owner or Estimator can mark the quote accepted and must upload the evidence (email, scan) and note how it was accepted;
  - it's clearly labelled **"Accepted (recorded by staff)"**, not "Signed by client", on the PDF and in reports.

### Rules

- A signature only applies to the **revision that was signed**:
  - a new revision issued afterwards needs a new signature;
  - the signed one stays locked, and later changes are variations.
- The signing link expires with the quote. One-time codes expire after 10 minutes, with limited attempts.
- **Withdrawing** a quote invalidates unsigned links straight away.
- Only Owners/Estimators can withdraw a quote or record acceptance; this permission already exists.
- Signature images and signed PDFs are kept for as long as the company keeps the quote's records. They're never shown publicly; the verify page shows only match / no match and the signing date.

### Legal note

- Electronic signatures with consent and a reliable way to identify the signer are generally recognised in Australia (Electronic Transactions Act 1999 (Cth) and state equivalents) and in many other countries.
- Some documents and states have extra rules. Companies should check their terms with their own adviser.
- The app records what it can to support this. It doesn't give legal advice.

### `signatures` core service (shared)

- Provides the signing view, one-time codes, consent capture, the audit trail, PDF sealing and the verify page.
- Blocks register a **signable document type** in their manifest (`signableTypes`), like document and email types:
  - `quotes.acceptance` now;
  - later `variations.approval`, `projects.completion`, `safety.swms_signon`, `inductions.acknowledgement`.
- **Sealing certificate:**
  - self-hosted servers generate their own on setup (stored with the server's secrets);
  - the hosted site uses one platform certificate;
  - companies can optionally upload their own certificate so the seal shows their company name.

## 7. Reporting (Owners/Estimators)

- Win rate, quoted vs won value, average margin, by client and by quote type.
- Quotes pending, expiring soon, viewed-not-answered.
- Later: quoted vs actual hours once timesheets exist.

## 8. Later

- **Accounting export** (Xero/MYOB): accepted quotes, deposits and progress claims for invoicing, rather than building invoicing in.
- Deposits/progress claim schedules on acceptance.
- Supplier API price feeds (instead of CSV), where suppliers offer them.

## 9. Permissions

- `quotes.view`: view quotes (Owner, Estimator)
- `quotes.create`: create/edit drafts (Owner, Estimator)
- `quotes.draft`: create and submit drafts for review, see own drafts only (**Foreman**)
- `quotes.review`: review, edit, return or approve submitted drafts (Owner, Estimator)
- `quotes.send`: send to clients, withdraw (Owner, Estimator)
- `quotes.costs.view`: see cost and margin (Owner, Estimator; off for Foremen by default)
- `quotes.pricebook.manage`: price book, assemblies, supplier imports, templates (Owner, Estimator)
- `quotes.clients.manage`: client records (Owner, Estimator)
- `quotes.reports.view`

**Estimator is a built-in role** (decided). When this block is built, add `ESTIMATOR` to the core system roles (`packages/core/src/block.ts` `SYSTEM_ROLES`), give it a display name in the companies block, and let blocks declare `grants.ESTIMATOR`. Default Estimator grants: all `quotes.*` permissions except company-wide settings it doesn't need, plus `companies.members.view`. Companies can still copy it into custom roles.

## 10. Menus

- `sidebar.main`: "Quotes" (shown only with `quotes.view` or `quotes.draft`)
- `header.actions` (phone): "New quick quote" for Foremen
- `home.widgets`: "Quotes to review", "Awaiting client", "Expiring soon"
- `settings.company`: "Price book", "Tax & currency" (branding and templates live in the Document Templates block's settings)
- `project.tabs`: "Quote" on projects created from or linked to a quote (financial permission required)

## 11. Data model sketch

- `Client`: `companyId`, `linkedCompanyId?` (if on the app), `name`, `abn?`, `contacts Json`, `addresses Json`, `defaultTerms`.
- `PriceItem`: `companyId`, `kind` (`LABOUR | MATERIAL`), `name`, `unit`, `cost Decimal`, `sell Decimal?`, `markupPct?`, `supplier?`, `supplierCode?`, `deletedAt`.
- `PriceItemHistory`: `priceItemId`, `cost`, `at`, `source` (`MANUAL | IMPORT`).
- `Assembly`: `companyId`, `name`, `unit`, `sellOverride?`.
- `AssemblyComponent`: `assemblyId`, `priceItemId?`, `childAssemblyId?`, `qty`.
- `IconAssemblyLink`: `companyId`, `iconKey`, `assemblyId`.
- `Quote`: `companyId`, `clientId`, `number`, `title`, `mode` (`QUICK | ESTIMATE`), `status`, `projectId?`, `siteAddress`, `validUntil`, `clientView` (`LUMP | SECTIONS | ITEMISED`), `createdById`, `reviewerId?`, `currentRevisionId`.
- `QuoteRevision`: `quoteId`, `label`, `sections Json` (snapshot), `totals Json`, `text Json`, `sentAt?`, `sentById?`.
- `QuoteLine`: `revisionId`, `sectionKey`, `kind` (`ITEM | ASSEMBLY | ONEOFF`), `refId?`, `description`, `qty Decimal`, `unit`, `cost Decimal`, `sell Decimal`, `taxCodeId`, `labourHours Decimal`, `optional Boolean`, `takeoffSource Json?`.
- `TaxSettings` (1:1 with company): `taxName`, `pricesIncludeTax Boolean`, `registrationLabel`, `registrationNumber`, `currency`, `locale`, `rounding` (`LINE | TOTAL`), `documentTitle`, `defaultTaxCodeId`.
- `TaxCode`: `companyId`, `name`, `label`, `rate Decimal(6,4)`, `exempt Boolean`, `active Boolean`.
- `PriceItem` and `Assembly` gain `taxCodeId?` (falls back to the company default).
- `QuoteRevision.taxSnapshot Json`: tax name, codes, rates, inclusive mode and currency at the time of sending.
- `QuoteEvent`: `quoteId`, `type` (`SUBMITTED | RETURNED | APPROVED | SENT | VIEWED | QUESTION | ACCEPTED | DECLINED | EXPIRED | WITHDRAWN`), `byUserId?`, `note`, `at`.
- `QuoteAcceptance`: `revisionId`, `method` (`SIGNED_ONLINE | SIGNED_IN_PERSON | RECORDED_BY_STAFF`), `signatureRequestId?`, `evidenceKey?`, `recordedById?`, `selectedOptions Json`, `total Decimal`, `at`.
- (`signatures` service) `SignatureRequest`: `companyId`, `type` (signable type key), `targetId`, `documentHash`, `documentKey`, `signerRule` (`ANY | ALL | ORDERED`), `status` (`PENDING | COMPLETED | DECLINED | EXPIRED | VOID`), `sealedPdfKey?`, `verifyCode`, `expiresAt`.
- `SignatureSigner`: `requestId`, `order`, `name`, `email?`, `phone?`, `position?`, `verifiedBy` (`EMAIL_CODE | SMS_CODE | ID_SIGHTED`), `signatureKind` (`DRAWN | TYPED`), `signatureKey?`, `consentAt?`, `signedAt?`, `declinedAt?`, `declineReason?`.
- `SignatureEvent` (append-only): `requestId`, `signerId?`, `type` (`OPENED | CODE_SENT | CODE_VERIFIED | OPTIONS_CHANGED | CONSENTED | SIGNED | DECLINED | SEALED | EMAILED | VERIFIED_LOOKUP`), `ip`, `userAgent`, `deviceTime?`, `at`.
- `QuoteLink`: `quoteId`, `token` (unguessable), `expiresAt`.

Money as `Decimal(12,2)`; all tables UUID + `updatedAt` + soft delete per sync conventions. Quick quotes can be drafted offline and submitted when back online.

## 12. Build order

1. Tax & currency settings; clients, price book (labour, materials), quick quotes, PDF.
2. Foreman draft → review → send workflow.
3. Assemblies and supplier CSV import.
4. Sections, options, revisions and compare; secure link; signed acceptance through the `signatures` service (one-time code, drawn or typed signature, audit trail, sealed PDF with certificate page, verify page). Later in this step: in-person signing, multiple signers, recorded acceptance.
5. Acceptance → project creation / chain placement; baseline for variations.
6. Take-offs from markups and measurements, revision change detection.
7. Reporting; accounting export.
