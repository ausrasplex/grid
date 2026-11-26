# Visual style: concept C (agreed)

The design canvas (https://claude.ai/artifact/TB5DBAto6SHu9pQWoxQTer, on claude.ai, not in this repo) shows every screen in this style. Its labels still use the old names (FieldApp, Modules); this file and `navigation.md` are the source of truth. Concept A (original light) and concept B (dark condensed) are kept on the canvas as references only.

## Colours

| Token | Value | Use |
|---|---|---|
| `bg` | `oklch(0.16 0.005 250)` | Page background, sidebar, rail, headers |
| `surface` | `oklch(0.21 0.006 250)` | Cards, sheets, bottom bar, inputs |
| `surface-2` | `oklch(0.27 0.007 250)` | Chips, list dividers, soft tiles |
| `border` | `oklch(0.31 0.008 250)` | Sidebar/rail edge, card outlines where needed |
| `text` | `oklch(0.96 0.003 90)` | Main text |
| `muted` | `oklch(0.74 0.01 250)` | Secondary text |
| `accent` | `oklch(0.87 0.17 95)` (hi-vis yellow) | Primary buttons, active menu items, New chips, badges, links |
| `on-accent` | `oklch(0.18 0.03 95)` | Text and icons on yellow |
| `accent-soft` | `oklch(0.31 0.06 95)` | Active menu item background, highlighted rows |
| Status | red `0.74 0.17 25`, amber `0.9 0.14 90`, green `0.8 0.15 150`, blue `0.8 0.1 240` | Text and borders on their own dark tinted backgrounds |

## Layout rules

- **Flat chrome:** headers, the sidebar and the tablet rail use the page colour. They're separated by a thin `border` line (sidebar and rail) or by spacing (headers), not by shaded bars.
- **Cards:** lightly rounded (14 px; every corner comes from `--radius` in `styles.css`, 10 px since Nov 2026, was 16 px), on `surface`. Separation comes from spacing; borders only where a list needs edges.
- **Menu lists (Settings):** options are inset buttons, not table rows: `<List variant="buttons">` gives each `LinkRow` a rounded `muted` fill with a gap between and padding around the list (decided Nov 2026, like Folio's option rows). The Settings page draws the same buttons itself (`SettingsSections`) so each can carry its pin (navigation.md §5). Data lists (jobs, quotes, people) keep the divided rows.
- **Home screen:** one "On site now" card with a single main action, and one **Next up** list (max 3–4 items, most urgent first, coloured dot per item, "See all"). There's no stats row, quick-action grid or activity feed on Home.
- **Type:** the system font. Compact headers: title, then a small muted meta line.
- **Phone bottom bar:** see `navigation.md` §5 (yellow top bar on the active item, raised Scan button).
- **Touch:** 44 px minimum targets; 48–54 px for main buttons.
- **Scrolling on phone and tablet:** no visible scrollbars. Anything that scrolls shows it instead:
  - lists and pages that run past the screen **fade out over the last ~40 px** at the bottom edge;
  - sideways rows (filter chips, breadcrumbs, "Other work areas") **fade at the right edge** (breadcrumbs fade on the left, since they open scrolled to the end);
  - the last visible row is cut part-way rather than ending neatly, so it reads as "more below".

  In the build: hide scrollbars with `scrollbar-width: none` / `::-webkit-scrollbar`, and add the fade with a CSS mask that's only applied while the element actually overflows (`useOverflow` in `@grid/ui` sets `data-scroll="down|left|right"`; the `<Scroller>` component wraps it). The fade disappears when you reach the end. Desktop (1024px+) keeps normal thin scrollbars.

## In the code (stage 1a)

- Tokens: `packages/ui/src/styles.css`. Concept C on `:root`; `data-theme="light"` and `data-theme="system"` on `<html>` give the optional light theme; `.paper` keeps an area light.
- Shell: `apps/web/src/components/ShellNav.tsx` (phone bar with Scan, tablet rail, desktop sidebar showing every item, no More). Menu placement comes from `MenuItem.prominence`.
- Cards have no outline or shadow; inputs keep a border so fields are easy to find.
- **Drop-downs (decided Nov 2026):** every drop-down is Grid's own (`NativeSelect` / `SelectField` in `@grid/ui`, built on Radix Select), never the browser's list: the box is card colour with rounded corners and a chevron, and the list that opens is a rounded popover in the theme, with touch-size rows, the current choice ticked in yellow, and a yellow focus ring. Don't use a bare `<select>`.
- **Gap under the top bar:** 20px on phones, 28px from tablets up (`pt-shell` in `styles.css`), so titles and breadcrumbs don't crowd the bar.
- The top bar has a 1px line under it (`border-b`, the `--border` token), like the phone bottom bar has one above it.
- **Sheets (Nov 2026):** `SheetContent` is a bottom drawer on phones. From tablet width up (768px) it slides in from the right (448px wide) for details, lists, pickers and longer editors, or shows as a centred dialog (512px) for short forms and questions: pass `desktop="dialog"` (changing your email, a client, a quote line, "Delete Level 3?", "Finish this job?").
- **Page width (Nov 2026):** on desktop (1024px+) content fills the space beside the sidebar, up to 1760px (`<main>` in ShellNav); below that it stays at most 1024px. Form fields (`Field`, `SelectField`, the client picker) stop at 672px so forms stay easy to read. Grids add columns on wide screens (photos up to 10 a row, plan sheets up to 6, `Grid` 3 at 1536px+). The job page puts Details, site notes and Finish in a side column from 1280px.

## Things that stay light

Light "paper" areas keep their original colours, with the accent shown as amber (`oklch(0.7 0.16 70)`) for selection outlines and pins:
- plan drawings;
- PDF pages in the document viewer;
- the template designer's A4 page;
- signing certificates;
- QR codes.

**Client-facing pages** use the company's own branding from the templates block, not the app theme:
- the online quote and signing pages;
- the public lost-and-found tag page.

## Themes (Nov 2026)

Each person picks a theme in **Settings › Profile › Appearance** (`User.settings.theme`, so it follows them to every device). Concept C stays the default. The list is `THEMES` in `packages/ui/src/lib/themes.ts`; the root layout puts `data-theme` and `data-look` on `<html>`, and every colour comes from the tokens, so no screen changes.

| Theme | Colours | Look |
|---|---|---|
| Grid (default) | concept C: dark graphite, hi-vis yellow | grid |
| Grid light | concept A palette (light, safety orange) | grid |
| Soft | light grey page, white cards, dark navy buttons and hero card, pastel lavender, peach and lime tiles | soft |
| Soft dark | the same on deep navy, lavender buttons | soft |
| Soft, match my device | Soft by day, Soft dark when the device is dark | soft |

**The Soft look is a trial (decided Nov 2026, modelled on the owner's Folio app).** Same screens and structure; what changes with `data-look="soft"`:

**Matched to Docket (Nov 2026):** the Soft shell and shapes are copied from the owner's Docket app (`docket/app/globals.css`, `docket/components/shell`). Where this list and Docket differ, Docket wins.

- **Shapes:** Docket's corner sizes, set as `--corner-*` in `styles.css`: `rounded-sm` 8px, `rounded-md` 12px (inputs, menu items), `rounded-lg` 14px, `rounded-xl` 16px (option rows, tiles), `rounded-2xl` 24px (sheets, dialogs); `Card` is 24px (`--card-radius`); pill buttons (`--radius-button`).
- **Type:** Plus Jakarta Sans; body 14px at weight 500; page titles (`PageHeader`) 26px bold, −0.02em; buttons 14px semibold. Inputs stay 16px so phones don't zoom.
- **Hover:** links and buttons ease their colour over 0.15s; menu items and plain icon buttons get the ink colour at 7% behind them; pills and boxes on white go to the light grey (`muted`).
- **Top bar:** over the content only (not the sidebar), the page colour at 72% with a frosted blur and a line under it. The business is a white pill (44px, no shadow) on the left; your picture on the right on every screen size (44px, initials on a lilac, peach or lime circle picked from your name); Jump to is a white pill. On desktop the bar is 72px and its contents line up with the content column. On phones Grid's mark sits at the left as the way Home.
- **Content:** a centred column, 1100px wide plus 32px either side on desktop (Docket's), with the title 18px under the top bar.
- **Desktop sidebar:** 224px with a line beside it, 18px in from the sides and 28px from the top. Grid's mark (32px) and name, then the list: the centre button (Scan, or Take a photo) first as a 44px navy pill with a shadow, then the menu items 6px apart: 44px tall, 12px corners, 14px semibold, grey; the current page is a white tile with a hairline shadow. Items that are under More on smaller screens follow after a line. No Log out here: it's in the sheet your picture opens.
- **Tablet rail:** keeps Grid's rail (Docket has none), with a line beside it; the current item's icon sits on a white tile with 12px corners, the others get the 7% ink hover; the centre button is round.
- **Phone bar:** white with a line above it (Docket's tab bar); 11px semibold labels; the current item is a whole lilac-tinted tile (12px corners); the round centre button (56px) sits raised 12px above the bar with a shadow.
- **Home:** "Good morning, Jesse" with the full date; a navy **hero card** ("3 active jobs on 2 sites.", On site now) with up to three numbered pastel tiles from the `home.tiles` panel slot (on phones the tiles scroll sideways and snap, at least 192px each, as in Folio) (Active jobs, Quotes out, Wallet); a **Needs attention** list from `home.attention` (tickets expired or due, sent quotes past their date); then Your jobs and Shortcuts side by side.

**Exact Folio values (Nov 2026):** the colours are Folio's Lilac theme (light and dark) from Folio's `docs/SPEC.md` "Design system": page `#f1f1f4`, cards white, text `#1f1c3b`, hero and buttons `#2b2849`, tiles lilac `#b8a5fa`, peach `#fddcb4`, lime `#e8fb4f`, focus `#7b5cf5`; dark: page `#14122a`, cards `#1f1d3a`, hero `#34306a`, lilac buttons. Font **Plus Jakarta Sans** (400 to 700, self-hosted with `next/font`, only in the Soft look). Corners as Folio: page cards 24px, hero card 18px, tiles 16px, inputs 12px, pills for buttons; page title 26px bold. All in `styles.css` under "Soft look".

## Your own themes (Nov 2026)

People can make their own colour theme in **Settings › Themes** (`/themes`, the core `themes` Block). Decided Nov 2026:

- **Who owns them:** both. **Your themes** belong to you (`CustomTheme.ownerUserId`, like the Wallet), so they follow you to every business. A business's themes (`companyId`) can be picked by everyone in it; only people with `themes.business.manage` (Owners by default) add, change or delete them. **Share with the business** copies one of yours into the business's; **Copy** makes your own copy of any theme you can see. While solo, the business section only shows once it has a theme in it.
- **Picking one:** the Appearance list (Profile) and the Themes list both save `User.settings.theme = "custom:<id>"`. A deleted theme, or one from a business you've left, falls back to Grid.
- **Simple + Advanced:** start from Grid, Grid light, Soft or Soft dark, pick the **look** (Grid or Soft shapes and font) and a few **key colours**: page, cards, text, main colour, and in the Soft look the Home card and three tiles. Grid works out every other token from those the way the built-in themes are put together (`deriveTokens` in `packages/ui/src/lib/custom-themes.ts`): lines, chips, quieter text, highlighted rows, menus, status colours (light or dark set from the page colour), and black or white text on buttons and tiles, whichever reads better. **Every colour (advanced)** lists all 32 tokens; one set by hand is saved in `overrides` and can be worked out again.
- **Readability warnings:** the editor checks the pairs that matter (text on page, cards and chips, quieter text, button text, highlighted rows, menus, status colours on cards, and in Soft the Home card and tiles) against WCAG contrast: 4.5 : 1 for text, 3 : 1 for links and status marks. It only warns; saving still works.
- **Export / import:** a theme saves as a small file (`<name>.grid-theme.json`, `{ format: "grid-theme", version: 1, theme }`) to bring into another Grid server, into your themes or (Owners) the business's.
- **In the code:** the root layout puts `data-theme="custom"`, the theme's `data-look`, and a `<style>` with `:root[data-theme="custom"] { --background: …; … }` in the head. Only checked `#rrggbb` values are ever saved or written into that rule. The phone's status bar uses the theme's page colour. `ctx.user.look` is the look either way (use it, not `lookOf(ctx.user.theme)`). Paper areas and client-facing pages are unchanged.
- A theme is one set of colours (no light and dark pair that follows the device, for now).

## App icon

- The one source is `public/icon.png` at the top of the repo (square, any size). The build makes every size from it (`apps/web/src/lib/app-icon.ts`): the browser tab and the Grid mark in the menus and on sign-in (`/icon/32`, `/icon/96`, cropped close), the installed app (`/icon/192`, `/icon/512`, also Android's maskable icon) and the iPhone/iPad home screen (`/apple-icon`).
- To change the icon, replace that file and rebuild. Keep the picture inside the middle 80% so Android's round crop doesn't clip it.
