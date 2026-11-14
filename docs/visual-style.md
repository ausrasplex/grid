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
- **Cards:** rounded (20–24 px), on `surface`. Separation comes from spacing; borders only where a list needs edges.
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
- Shell: `apps/web/src/components/ShellNav.tsx` (phone bar with Scan, tablet rail, desktop sidebar with expanding More). Menu placement comes from `MenuItem.prominence`.
- Cards have no outline or shadow; inputs keep a border so fields are easy to find.

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

## Theme switching (later)

Concept C is the default. Because the layout is shared, the original light colours (concept A's palette) can be offered as a **light theme**, chosen per person or following the phone's setting. All colours come from the tokens above, so no screen hardcodes a colour.

## App icon

- The one source is `public/icon.png` at the top of the repo (square, any size). The build makes every size from it (`apps/web/src/lib/app-icon.ts`): the browser tab and the Grid mark in the menus and on sign-in (`/icon/32`, `/icon/96`, cropped close), the installed app (`/icon/192`, `/icon/512`, also Android's maskable icon) and the iPhone/iPad home screen (`/apple-icon`).
- To change the icon, replace that file and rebuild. Keep the picture inside the middle 80% so Android's round crop doesn't clip it.
