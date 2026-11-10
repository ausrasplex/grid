# Deployment modes, federation and QR tags: agreed design

Status: **agreed direction, not built yet.** Applies across all stages, so build choices made now must not block it.

## Modes

| | Self-hosted (now) | Hosted (later) | Federated (later) |
|---|---|---|---|
| Who runs it | A company on its own server (e.g. Unraid) | One main site everyone signs up to | Self-hosted servers linked to the main site |
| Sign-up | **Invite-only** | **Open sign-up** + email verification | Each server keeps its own rule |
| Companies | Usually one or a few | Many | Mixed |

Switched by config (`SIGNUP_MODE=invite|open`, `HUB_URL`, `INSTANCE_ID`), not by separate code.

## Already in place

- Every query is scoped to the signed-in company → multi-company from day one.
- Planned `platform` block (Super Admin) is the hosted site's operator role.
- Blocks enabled per company → later doubles as plans/pricing via a billing block.
- `StorageAdapter`: local disk now, S3/R2 later.
- Email: system default + per-company SMTP.
- UUIDs everywhere → a company can be copied between servers without ID clashes.

## Decisions

### 1. QR tag addresses

- Tags use a **short, permanent domain you own, separate from the app's address**, e.g. `tag.yourapp.com.au/K7QX-92MF`. If the app moves, that domain only redirects, so printed stickers keep working forever.
- **No company name in the link.** Reasons:
  - Names change, companies merge, and two companies can share a name on a hosted site; a rename would break printed stickers.
  - It would reveal the owner even when a company has turned public lookup off.
  - It isn't needed: the random code is already unique.
- **The company's name and logo go on the printed sticker instead** (visible to people, not part of the link), plus the friendly number ("Asset No. 1234").
- **Code format:** random, unguessable, unique across *every* server: an `instance prefix + random part`, e.g. `K7QX-92MF-4TD8`. The prefix lets the main site route a scan to the right self-hosted server (see 2). Self-hosted servers created before joining the hub get a prefix when they register; their existing codes stay valid through a lookup table.

### 2. Federation: self-hosted servers linked to a main hosted site

Possible, as hub-and-spoke: the main site is the **hub**, each self-hosted server registers with it, gets an `INSTANCE_ID` and signing keys, and talks to it over signed HTTPS requests. The hub can revoke a server. **Each company's data stays on its own server**; only what's explicitly shared crosses over.

Delivered in phases, easiest first:

- **Phase A: tag registry + lost and found.** Scanning any tag anywhere resolves through the hub to the owning server; "found" reports are relayed to that server's Owners/Foremen. Small, low-risk, high value.
- **Phase B: shared identity + company directory.** One login that works on any linked server ("Sign in with [hub]"), and searching for companies across all servers when inviting.
- **Phase C: cross-server projects.** A project lives on **one** server (the host's). People from companies on other servers join it using their hub identity, as guest members of that server. Their data for *that* project is stored on the project's server. Full two-way syncing of projects between servers is deliberately **not** planned: it's very complex and fragile.

Build-now requirements so this stays possible:

- `INSTANCE_ID` config and the tag-code prefix from day one.
- Users get an optional `homeInstance` / external identity field (filled in Phase B).
- Every outbound/inbound hub call goes through one `hub` client block, off by default.

### 3. Running several app servers, and keeping companies separate on the hosted site

Two separate concerns:

- **Several copies of the app server** (needed when the hosted site grows): nothing important may live only in one server's memory. The in-memory event bus moves to the pg-boss job queue in stage 3; sessions are cookies + database. Self-hosted servers can run just one copy.
- **Keeping companies apart on the hosted site:** the app already scopes every query to the signed-in company. The hosted site adds a second lock: **Postgres row-level security**, so even a bug in a query can't return another company's rows. Plus per-company storage quotas and rate limits.

### 4. Sign-up

- Self-hosted: **invite-only**. First Super Admin created from the command line; companies and users come in by invitation.
- Hosted: **open sign-up** with email verification, optional ABN check, and anti-spam rate limits.

### 5. Quick routes (links and QR codes to projects, quotes, sites and sheets)

These work the same way as asset tags. A route code is `server prefix + random part`; job and quote numbers never appear in links.

| Setup | Link | Resolves |
|---|---|---|
| Hosted | `tag.yourapp.com.au/K7QX-92MF-4TD8` | Directly on the hosted site |
| Self-hosted, linked to the hub | Same link | The hub reads the prefix (`K7QX`) and redirects to that company's server, which opens the target |
| Self-hosted, not linked | `<server address>/go/92MF-4TD8`, from a configurable `PUBLIC_LINK_BASE` | Directly on that server. When it later joins the hub, these links keep working, and new ones use the tag address |

- **The hub only knows which server a prefix belongs to.** It never stores or sees project names, addresses or content. A redirect carries only the code.
- **Links don't grant access.** The owning server decides: sign in, request access, or open.
- Across servers (Phase C), a guest's link goes to the server where the project lives, and they sign in with their hub identity (Phase B).
- **Server offline:** the hub shows a plain "This company's server is offline right now" page. The phone app opens anything already synced on the device before trying the network, so it works without the server.
- **Phone app links:** the app registers the tag address and each self-hosted `PUBLIC_LINK_BASE` the user is signed into (iOS universal links / Android app links), so links open in the app.

Build now: the `RouteCode` table and `/go/:code` handler on every server, `PUBLIC_LINK_BASE` config, and a route resolver in the `hub` client block (off until the server joins the hub).

## Later, hosted site only (no impact on existing code)

- Billing block (e.g. Stripe), mapping plans to enabled blocks.
- Hosting in an Australian region (builders and government jobs may require it).
- "Move my company from my server to the hosted site" export/import tool.
