# Scheduling Block

Status: **parts 1 and 2 built (Nov 2026).** Block id `scheduling`, **core** (`required: true`, always on; decided Nov 2026), pages at `/schedule`, API `/api/scheduling`, depends on `companies` and `projects`. Agreed in the Grid project's `blocks/scheduling-block-plan.md` (Nov 2026); this doc is the record in the repo.

## Principles

- **No extra data entry.** Booking a time is the only thing asked for. No clocking on or off, no actual start and finish times, no availability. Time off is optional and only for when you're away.
- **Sole traders first.** Works for one person with nothing to set up. Team features (assigning people, crew views) come later without reshaping the data.
- **Grid is the source of truth.** The phone calendar feed (part 2) is read-only.
- **Warn, never block.** A clash, a busy day or time off asks "Book anyway?".
- Keep it lean: fewer, useful views.

## Jobs have visits

- A job has **one or more visits**, each with its own day and time (rough-in, then fit-off weeks later). A job can start with one and get a second later without being made again.
- **One visit reads like a date on the job:** "Booked: Thu 3 Dec, 8:00 am – 10:00 am", with **Add another visit**. Two or more become a list.
- A visit is **timed** (a start and finish on one day; the finish fills in from the business's visit length) or **all day**, over one or more days.
- **Tentative** ("builder says probably Thursday"): shown faded with a Tentative chip until **Confirm**.
- A visit is **Booked**, **Done** or **Cancelled**. Done can be undone ("Not done yet"); a visit can't be marked done before its day. Cancelled visits drop off the schedule and the job shows "1 cancelled". Nothing is deleted (Analytics leaves cancelled ones out).
- **Job status follows visits** without changing the job's own status (decided Nov 2026, see "Second status"):
  - Marking the last booked visit done asks **Mark job complete?** (only for people who can finish jobs). Never automatic.
  - A won job with no booked visit shows in **To be booked**.

## Second status: "Active • Scheduled"

Active jobs (won, not finished, not archived) get a **second status** from their visits, shown after Active. The job's own status (Active, Finished, Quoting, Not won) never changes. Worked out each time, in this order (cancelled visits don't count):

| Second status | When | Hint |
|---|---|---|
| **Scheduled** | at least one confirmed booked visit | "Next Thu 3 Dec" (or "Mark the last visit done" when every booked visit has passed) |
| **Tentative** | booked visits, but none confirmed | "Maybe Thu 3 Dec" |
| **Visits done** | every visit done, the job not finished | "Finish the job or book another" |
| **To be booked** | nothing booked | |

- Shown on the **job page** under its name ("Active • Scheduled · Next Thu 3 Dec"), as a chip on the **Jobs table** (/jobs) with a filter under Active (All active, Scheduled, Tentative, To be booked, Visits done, with counts), and as a chip on **every job list** (Home's active jobs, a site's, level's and client's jobs).
- Comes through the `jobSecondStatus` Block hook (`docs/ADDING_A_BLOCK.md`), one call for a whole list, so Jobs doesn't depend on Scheduling.
- Analytics counts from visits, not from these words.

## The Schedule (`/schedule`)

- **Agenda** (the default): Today and Tomorrow always, then each day with something on it, two weeks at a time (**Show the next 2 weeks**). Each visit: start time (or All day, or "Day 2" of a multi-day visit), job name, Tentative or Done, label, suburb, client, "until 10:00 am". Tapping opens the job.
- **Your time off** shows as one line on its first day: "Away Tue 1 Dec afternoon – Thu 3 Dec", not a run of empty days.
- **To be booked**: active jobs (won, not finished, not archived) with no booked visit. Either "Not booked yet", or "Every visit done (last Thu 3 Dec): book another or finish the job". **Book** opens the job with the booking sheet (`/jobs/<id>?book=1`).
- It shows the whole business's visits. While solo that's yours; teams get a "just mine" view later.

## Warnings when booking

Checked when a visit is booked or moved (not when it's renamed or confirmed). They come back as warnings in the booking sheet, at the top, with **Book anyway** or **Pick another time**:

- **Clash:** "Clashes with Rough-in at Smith St reno, 8:00 am – 10:00 am." Timed visits only: an all-day visit doesn't clash with timed ones.
- **Busy day:** your optional **Busy day warning** (Settings › Scheduling & time off, empty = off): "Thu 3 Dec will have 6 visits (your limit is 5)." Booked, done and tentative visits count; cancelled don't; a multi-day visit counts on each day.
- **Time off:** "You're away Wed 2 Dec (Annual)." An afternoon off leaves the morning free, and a morning off leaves the afternoon.
- Each person's own visits only (`Visit.assignedUserId`: whoever booked it, for now), so it carries over to teams.

## Time off

- **Shares the Leave Block's records** (core `companies`' `Leave` table; decided Nov 2026). Time off is the solo version of leave: the same form (type from Leave's list, from and to, morning or afternoon on the first and last day, or **some hours** on one day, a private note), the same "Away" wording, and **saved as approved** (the solo rule skips approval). When a team switches the Leave Block on, existing time off is just approved leave: nothing to move. Only approved leave blocks bookings.
- Kept in core so neither the Scheduling nor the Leave Block depends on the other. `approvedLeave()`, `myTimeOff()`, `saveTimeOff()`, `deleteTimeOff()` in `blocks/companies/leave.ts`.
- **Some hours** (decided Nov 2026): one day, **Away from** and **Back at** ("1:00 – 3:00 pm", the dentist). Only those hours count: a visit at 9 am or 4 pm that day books without a warning. Stored as `Leave.fromTime`/`toTime` with `firstDayHours` as the length, so the Leave Block's "hours" uses the same times. Over more than one day it's whole days or halves.
- **Settings › Scheduling & time off** lists your time off from today on: add, change, remove.
- **Adding time off over booked visits** lists them after saving ("2 visits are booked while you're away"), with a link to each job. Nothing is moved or cancelled.

## Home

- **Grid look:** a **Today** card at the top with today's booked visits (time, job, label, suburb), when there are any.
- **Soft look:** Needs attention gets **Not confirmed** rows for tentative visits in the next 7 days, and "**3 jobs to be booked**". (Its three tiles are already jobs, quotes and tickets.)

## Settings

- **Your own** (anyone who can see the schedule): Busy day warning, Time off.
- **Booking defaults** (`scheduling.settings`, Owner and Foreman): a new visit's length (2 hours to start), and the working day (7:00 am – 3:30 pm to start; only for sizing the week view, never availability).
- The timezone is the server's `TZ` from the Unraid template. Visits are stored in UTC and shown in it; weeks start Monday.

## Permissions

| Key | Who | Lets them |
|---|---|---|
| `scheduling.view` | everyone | See visits on jobs and the Schedule; their own time off and busy day warning |
| `scheduling.visits.book` | Owner, Foreman, Employee | Book, change, confirm, cancel and mark visits done |
| `scheduling.settings` | Owner, Foreman | Booking defaults |

Finishing a job from "Mark job complete?" also needs `projects.complete`.

## Decided while building part 1 (Nov 2026)

- **No "Scheduled" job status; a second status instead.** The plan had *Scheduled* in the job's status list, but a new status would touch every place that checks for an active job (lists, Home, quotes), and missing one would quietly hide a job. So the status stays as it is and active jobs get a second status worked out from visits ("Active • Scheduled", see above). Analytics counts from visits too.
- **Scheduling is core** (`required: true`): every business books visits, so it's always on and doesn't appear as something to switch on in the Store. Nothing else changed: it's still its own Block in `blocks/scheduling`.
- **Leave lives in core** (`companies`), not in either Block.
- **Visits belong to whoever booked them** (`assignedUserId` is set); teams will pick a person.
- **Schedule sits after Quotes in the menus** (order 35), so the phone bar keeps Sites and Quotes; Schedule is under More on phones.
- Labels have quick picks (Rough-in, Fit-off, Service, Quote visit, Inspection) but are free text.

## What part 1 built (Nov 2026)

- The `scheduling` Block: `Visit`, `SchedulingSettings`, `SchedulingUserSettings`; core `Leave` with `LeaveType`, `LeaveStatus`, `DayPart` (migration `20261128120000_scheduling`).
- Visits on the job page (`job.top`), the booking sheet with warnings, Confirm, Done, Not done yet, Cancel, Mark job complete?.
- The Schedule: Agenda and To be booked. Home's Today card (Grid look) and Needs attention rows (Soft look).
- Settings › Scheduling & time off. Time off saving lists visits to move.
- `times.ts` (timezones, days a visit covers, part days) and `words.ts`, both tested. `scheduleJobs()` in projects gives a job's name, number, suburb and client to other Blocks.
- Core, so on for every business, new and existing.

## Week view (part 2)

- **The Schedule's Week tab** (Mon–Sun, ‹ › and This week). It's the first tab on a screen 1024px or wider; phones start on Agenda. `/schedule?show=week` opens it.
- **Tablet and computer: a time grid.** The hours are the business's working day, stretched to fit any visit outside it. All-day visits sit in a row above. Overlapping visits share the column side by side.
  - **Drag a visit** to another time (snaps to 15 minutes) or another day; an all-day visit moves its whole span. A clash, busy day or time off asks **Move this visit?** with **Move anyway** or **Leave it**. Done visits don't move.
  - **Tap a visit** to change it in the booking sheet (with **Open the job**). A done one opens its job.
- **Phone: the seven days as a list** (dragging on a small screen is fiddly). Tap a visit to change it.
- **Each day** says **Full** at your busy day warning and **Over (6)** past it.
- **Time off shows as Away blocks** (decided Nov 2026), grey and dashed so they're never mistaken for a job: a whole day in the all-day row (with its type), a morning from the top of the day to midday, an afternoon from midday to the end, some hours over those hours. They share a day's column with visits side by side. **Tap one to change or remove it.** They don't drag (so time off isn't moved by accident). On phones and in the agenda it's an "Away" line in time order ("Away 1:00 pm – 3:00 pm").
- **A day's ⋯ menu → Block out this day** opens the time off sheet on that day. (This replaces the plan's long-press: a menu works the same with a mouse, a finger or a keyboard.)
- **The booking sheet says "You're away that day"** as soon as a day you're away is picked. Phones' own date boxes can't grey days out, so this is the closest; booking still warns.

## Phone calendar (part 2)

- **Settings › Scheduling & time off › Phone calendar:** **Show my visits in my phone's calendar** turns it on. Then **Add to my calendar** (a `webcal://` link: on an iPhone it opens Calendar's Subscribe), **Copy the link** (for Google Calendar: Other calendars › From URL), "Last checked by a calendar …", **Get a new link** (the old one stops straight away) and **Turn off**.
- **One private link per person per business** (`CalendarFeed`): `…/api/public/scheduling/feed/<token>.ics`. Nobody signs in; the token is the only key. It's stored hashed (to find it) and encrypted (to show it again), like the handover link. It stops working if the person leaves the business or the business is deleted. More than 60 checks an hour from one link gets "Too many checks".
- **What's in it:** your visits (not cancelled) from 30 days ago on: the job and label ("Smith St reno: Rough-in"), "(Tentative)" or "(Done)", the job's address, then the client with their phone, the job number, the visit's notes and **Open in Grid** (a link to the job). Your time off as **Away** with its type but never the private note: all-day (showing free) for days and half days, a timed event (showing busy) for some hours.
- **Read-only:** changes are made in Grid; calendars check about every hour (the file asks for hourly).
- The link starts with `PUBLIC_LINK_BASE` (else `BETTER_AUTH_URL`) from the Unraid template, like other links that leave Grid. A phone away from home can only fetch it if Grid is reachable from the internet (a Cloudflare Tunnel, say).

## What part 2 built (Nov 2026)

- `WeekView.tsx` (the grid with drag, and the phone list), the Week tab, Block out this day, the "You're away that day" hint.
- Away blocks (tap to change), and time off for some hours (`Leave.fromTime`/`toTime`, migration `20261128150000_time_off_hours`).
- `CalendarFeed` (migration `20261128140000_calendar_feed`), `feed.ts`, `ics.ts` (tested: escaping, folding long lines, all-day end dates), the public route, Settings › Phone calendar.
- `publicBaseUrl()` in `@grid/db` (the start of links that leave Grid) and `tooManyRequests()` in `@grid/core`.
- `scheduleJobs()` gives the client's id too, and Scheduling now depends on Clients (for the client's phone in the feed).

## Later

- Client reminders by SMS or email the day before (off by default, a provider through the Unraid template).
- Teams: assign visits, crew view, "only see my visits", per-person feeds; who's away from the Leave Block.
- Repeating jobs (test & tag, maintenance). Public holidays by state.

## Ruled out

- Clocking on and off, actual vs booked times, availability and utilisation: they need extra typing.
- Travel time between jobs.
- Two-way calendar sync: Grid stays the one source.
