# Scheduling Block

Status: **part 1 built (Nov 2026); part 2 (week view, phone calendar feed) next.** Block id `scheduling`, pages at `/schedule`, API `/api/scheduling`, depends on `companies` and `projects`. Agreed in the Grid project's `blocks/scheduling-block-plan.md` (Nov 2026); this doc is the record in the repo.

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
- **Job status follows visits** without changing the job's own status (decided Nov 2026, see below):
  - Marking the last booked visit done asks **Mark job complete?** (only for people who can finish jobs). Never automatic.
  - A won job with no booked visit shows in **To be booked**.

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

- **Shares the Leave Block's records** (core `companies`' `Leave` table; decided Nov 2026). Time off is the solo version of leave: the same form (type from Leave's list, from and to, morning or afternoon on the first and last day, a private note), the same "Away" wording, and **saved as approved** (the solo rule skips approval). When a team switches the Leave Block on, existing time off is just approved leave: nothing to move. Only approved leave blocks bookings.
- Kept in core so neither the Scheduling nor the Leave Block depends on the other. `approvedLeave()`, `myTimeOff()`, `saveTimeOff()`, `deleteTimeOff()` in `blocks/companies/leave.ts`.
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

- **No "Scheduled" job status.** The plan had *Scheduled* in the job's status list, but jobs' statuses are core (`ACTIVE`, `COMPLETED`, `QUOTING`, `NOT_WON`) and an optional Block can't add one without core depending on it. Instead "scheduled" is worked out from visits: a won job with a booked visit is scheduled, one without is in To be booked. Analytics counts the same way.
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
- On for new businesses (solo and every trade). Existing businesses switch it on in the Store.

## Part 2 (next)

- **Week view** (Mon–Sun) with drag to reschedule, "Full" and over-limit markers, greyed Away days, long-press a day → Block out.
- **Calendar feed (iCal):** a private subscribe link per person, read-only. Event title job + label, location the job's address, description client, phone and a link back. Tentative marked "(Tentative)", time off as all-day "Away", the past 30 days and everything ahead. Regenerate to stop the old link.
- A date picker that greys out days you're away (the phone's own date box can't, so part 1 warns after picking).

## Later

- Client reminders by SMS or email the day before (off by default, a provider through the Unraid template).
- Teams: assign visits, crew view, "only see my visits", per-person feeds; who's away from the Leave Block.
- Repeating jobs (test & tag, maintenance). Public holidays by state.

## Ruled out

- Clocking on and off, actual vs booked times, availability and utilisation: they need extra typing.
- Travel time between jobs.
- Two-way calendar sync: Grid stays the one source.
