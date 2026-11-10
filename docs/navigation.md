# Navigation: sites, buildings, levels and projects

Status: **agreed.** The canvas shows it in the concept C style. Data, ownership and access rules behind it are in `stage-2-projects.md` §1; induction checks per level are in `inductions-credentials.md` §1.

## 1. Model

- **Site** is the top level of the app (a precinct, a shopping centre, a house). A site sets out its **buildings**.
- **Building** is either **multi-level** (it has an ordered list of levels, highest first) or **single-level** (no levels).
  - A single-level building can be converted to multi-level later; its existing work moves to "Ground".
  - Zones within a level stay optional and come later.
- **Project** belongs to one site and has a **Covers** list: the buildings and levels it works on.
  - **Whole building** includes levels added to that building later.
  - A single-level building is just ticked on or off.
  - Covers drives which projects appear on a level and the project's "Other work areas".
- Plans, tasks, RFIs, variations and permissions still belong to the **project**, which is where the contract chain lives. Location is how people navigate; the project is what owns the data.

## 2. Breadcrumbs

The trail is `Site ▾ › Building ▾ › Level ▾ › Project ▾`. Every crumb is a picker:

| Crumb | Tapping it lists | Notes |
|---|---|---|
| Site | Other sites (search box, recent first, link to archived) | Switching site returns to where you last were on that site. |
| Building | Other buildings on the site, with level count and active projects | Switching building keeps the same level when it exists; otherwise the level crumb shows "Choose level". |
| Level | The levels of this building, highest first, with active-project count and an induction flag | A dot marks levels the current project covers. |
| Project | Projects on this level (with builder and "You're on it"), plus **All projects here** | Replaces the earlier project filter chips. Link to archived projects on the level. |

The pickers are a drop-down on desktop and tablet, and a bottom sheet on phone.

Hiding rules:
- The Building crumb hides when the site has one building.
- The Level crumb hides when the building is single-level.
- The Project crumb appears once a project is picked. A project is picked automatically when it is the only one on the level.

So a house reads `12 Smith St ▾ › Switchboard Upgrade ▾`.

### Phone width

- When all four crumbs show, the **Site crumb shrinks to a building icon**. It still opens the site picker, and its label is the site name for screen readers.
- If the trail is still wider than the screen, it **scrolls sideways**:
  - no visible scroll bar, with a fade on the left edge;
  - full names are kept, not truncated;
  - a trail that fits is **left-aligned**.
- The site QR button moves out of the header to sit beside the page title, to give the crumbs room.

## 3. Other work areas

Shown once a project is selected and it covers more than one area.

- It lists every building and level in the project's Covers, grouped by building. Each area shows a task count, a "New rev" flag and an induction flag, and the current area is marked.
- Jumping to an area **keeps the project selected**. Jumping through the Level crumb instead shows everything on that floor.
- Placement: a chip row under the title on phone, and a panel in the side column on tablet and desktop.

## 4. Sites list

- Tabs: **Active · Mine · Archived**, with search by address, customer or site name. Most recently opened first.
- **Sites archive automatically** when their last project closes.
- Starting a new job at an archived address **reactivates** the site, with its history ("Earlier jobs at this address"). It does not create a duplicate.
- **Earlier jobs live on the site page, never inside a project.**
  - The site page (for a house, reached through Project crumb › All projects here, or from the Sites list) shows current jobs, **Earlier jobs at this address** (archived, read-only, with photos and certificates), and **Site notes**.
  - Site notes are access and hazard info kept with the address, so every job there sees them.
  - A project view only ever shows that project's own work, because older jobs may not be relevant to it.
- Domestic companies therefore see a short list of current jobs, and each job opens straight to its work because the Building and Level crumbs are hidden.

## 5. Main menus

**Phone (bottom bar):** Home · Sites · **Scan** · My work · More.
- **Active item:** a yellow bar across the top of its slot, with its icon and label in yellow. Other items are grey.
- **Scan:** a raised yellow button in the middle, above the bar, so it's easy to hit with a thumb or glove. It opens the one scanner (§7a).
- **Projects:** there's no Projects tab. Projects are reached through Sites (Site › Building › Level › Project) and Jump to search, and screens inside a project highlight **Sites**.
- **Badges:** a small yellow dot on My work when something is waiting.

**Tablet (left rail):** Home · Sites · My work · More, with a yellow Scan button under them and your avatar at the bottom.

**Desktop (sidebar):**
- **Items:** Home · Sites · My work · Quotes · More. My work shows a count badge.
- **More:** expands in place to Assets, Documents, Inductions, Templates, Members and Settings. It stays open, with the current page highlighted, when you're on one of those pages.
- **Footer:** your avatar and role sit at the bottom.
- **Top of the page:** the page title, and the Jump to search (with Scan) and notifications on the right. There's no separate shaded header bar.

Blocks still add menu items through their manifest slots. On phone and tablet, anything beyond the main items goes under **More**.

### 5a. The centre button changes with context

The raised yellow button (phone bar centre, tablet rail, desktop top bar) is a shortcut whose job depends on who you are and where you are:

| Situation | Button | Tap does |
|---|---|---|
| **Sole trader** (one active member, no pending invites; the same check that hides team features) | **Take a photo** (camera icon) | Opens the camera straight away. The photo goes to the job you're on; from Home or another page, it goes to the job you last used, with a one-tap "Change job" before saving. |
| **Team member, not checked in to a site** | **Scan** | Opens the one scanner (§7a), mostly to scan a site QR and check in. |
| **Team member, checked in to a site** (by scanning its QR) | **Actions** (the button shows a + and a small up-chevron) | Opens a menu above the button: **Scan**, **Photo**, then any items Blocks add (e.g. Note, Report a fault). Photo saves to that site's project and level. |

- **The scanner never disappears.** A solo trader still scans asset tags and product barcodes from the scan button in every search bar (§7a).
- **Blocks fill the Actions menu** through a new menu slot, `shell.quick`, ordered by `order` and filtered by permission like any other slot. Scan is always first, then Photo.
- **Photo needs the Photos block** (built in 2b-lite). Until it's on, a sole trader's button stays as Scan. *Provisional: this fallback may change later.*
- **Built so far:** Scan and Take a photo (`AppShell.tsx` `centreButton()`). The Actions menu comes with site check-in (phases 7–8).
- **Checking out** (leaving the site, or the check-in expiring at the end of the day) turns the button back into Scan.
- The button's label under it changes too (Photo / Scan / Actions), so it's never a mystery icon.

## 6. Jump to search

One search that understands numbers. It is part of navigation, not a separate search page.

**Where it lives**
- **Phone:** a search icon in the header on every screen, and a search bar at the top of Home and Sites.
- **Tablet and desktop:** a search box in the top bar, opened from anywhere with **Ctrl/⌘ + K**.

**What it matches**
- **Project and job numbers, including other companies' references.**
  - A project stores a reference per company in the contract chain: the builder's project number, each subcontractor's job number, PO numbers.
  - Each person searches by the number *they* know. A company's own reference is only visible to that company.
- **Quote numbers** (Q-1042):
  - an accepted quote opens the project it created or joined, with a link back to the quote;
  - a pending quote opens the quote itself.
- **Sites, addresses and clients.** Partial words work, so "smith bruns" finds 12 Smith St, Brunswick.
- **Items inside projects:** RFI-012, VAR-007 and sheet numbers like E-502. Each result says which project it belongs to.

**Results**
- Grouped as Projects, Quotes, Sites, then Sheets / RFIs / Variations. Each shows its breadcrumb trail so similar names can be told apart.
- An **exact number match is always first**, and Enter jumps straight to it.
- With nothing typed, it shows **recent and pinned** projects.
- Results are filtered by permission: you only see what you could open anyway.
- **Offline**, it searches what's synced on the device and says so ("Showing results on this device").
- If you're signed into **more than one server** (your employer's plus a builder's hosted projects), it searches all of them. Each result is labelled with its company or server.

**Where a result lands**
- The project opens with all crumbs filled in.
- A project covering several levels lands on **the level you last used on that project**, otherwise a short project overview listing its work areas.
- A sheet, RFI or variation opens that item, with the crumbs set to its project and level.

## 7. Quick routes: QR codes and short links

Every project, quote, site and sheet gets a **route code**: random, unguessable and unique across every server, using the same generator and server prefix as asset tags. See `deployment-modes.md` §1–2 and §5.

- **Links and QR codes use the code, never a job number.** Job numbers repeat across companies; numbers are for *typing* into Jump to search.
- **Where they appear:** the site QR, a small QR on printed plan sheets (opens that sheet at its current revision), a QR on quote PDFs (opens the quote or its project), and "Copy link" on any project, sheet or quote.
- **A link only routes, it never grants access.**
  - Not signed in → sign in on the server that owns it.
  - No access → the **request access** screen, the same flow as scanning the site QR.
- **Phone app:**
  - The app registers the link address, so scanning a QR or tapping a link opens the app, not the browser.
  - It checks the code against data already on the device **first**, so it works offline, or when a company's server is down, for anything already synced.
- How codes resolve across hosted, self-hosted and linked servers is covered in `deployment-modes.md` §5.

## 7a. One scanner for everything

Every search bar (Jump to, Documents, a manufacturer page, Assets) has a **scan button**: a viewfinder icon with a barcode line, used the same way everywhere. The camera icon is kept for taking photos only. All scan buttons open the **same scanner**, which works out what it's looking at:

| It reads | It opens |
|---|---|
| An app QR code (route code: site, project, sheet, quote) | That item, via the quick-route rules in §7 (sign in or request access if needed) |
| An asset tag | The asset screen, with its Actions (Check out / Return, Fault, Lost) |
| A product barcode or a printed model number | The product model page (see `documents-block.md`, Scan the product) |
| Anything else | "Not recognised", with **Type it instead** |

- The screen it was opened from can narrow it. From Documents it looks for products first; from Assets, for tags first.
- Recognition runs on the phone, so scanning works offline for anything synced.

## 8. Build notes

- **Built in 2a:** `blocks/projects/ui/LocationBar.tsx` (crumbs and pickers; drop-downs are portalled so the scroll fade can't clip them), the site/building/level pages and the job page with Work areas chips (`blocks/projects/ui/index.tsx`), Jump to (`JumpTo.tsx`), and Home's "On site now" card.
- **"Choose building / Choose level"** crumbs only show once you're on a job or deeper, not on the site page itself.
- **Site crumb as an icon** applies to phones only; from 640px the name shows.

- **Centre button (§5a):** AppShell works out the mode on the server (solo check, Photos block on, current site check-in) and passes `centre: { mode: "photo" | "scan" | "actions", items }` to ShellNav. The phone bar, tablet rail and desktop top bar all render from that one value.

- **Breadcrumb scroll position:** when the location or project changes, scroll the current (last) crumb into view: `scrollIntoView({ inline: "end", block: "nearest" })` on the crumb row, run after render.
  - Don't rely on the `direction: rtl` CSS trick the mockup uses. It only positions the row on first load.
  - Keep a short trail left-aligned. The mockup does this with the row as a flex container and the inner trail `margin-right: auto` (`flex-shrink: 0`).
- **Choosing the Site crumb style:** decide between icon and full label from the number of visible crumbs (icon when there are 4). If needed, measure the real width with a ResizeObserver so long names on narrow phones also get the icon.
- **Remembering where you were:** store the last location per site per user, on the server so it follows the user across devices, with an offline cache. Use it when switching sites.
- **Pickers:** use one component, a Popover on wide screens and a Sheet on phone, with the same item list (label, meta, current check, coverage dot, warning chip). Lists longer than about 8 items get a search box.
- **URLs mirror the trail:** `/sites/:site/b/:building/l/:level/p/:project/...`, with hidden crumbs omitted. Deep links and the back button then behave predictably.
- **Accessibility:** crumbs are buttons with `aria-haspopup`. The trail is a `nav` labelled "Location". The icon-only site crumb has an `aria-label` naming the site.
- **Search:** use Postgres full-text search (`tsvector`) for names and addresses, plus `pg_trgm` trigram indexes for partial numbers and typos. No separate search server.
  - A small `search_index` table, fed by blocks through a `searchProvider` in their manifest, gives Projects, Quotes, Sheets, RFIs and so on one ranked query.
  - Permissions are applied in the query, not after it.
  - Exact matches on number fields get a ranking boost.
- **Offline search:** the mobile app keeps a compact local index (SQLite FTS) of synced records, updated by the sync engine.
- **Project references:** a `ProjectReference` table (projectId, companyId, label, value), unique per company. It is shown and searched only for that company.
- **Route codes:**
  - one `RouteCode` table (code, type, targetId, createdAt, revokedAt), sharing the code generator and server prefix with asset tags;
  - codes are created when a project, quote, site or sheet is created;
  - revoking a code stops its printed QR without deleting the record.
- **One handler:** `/go/:code` on every server resolves the code. It then sends the user to sign in, request access or the target page.
- **Last level per project:** stored per user, alongside the last location per site.

