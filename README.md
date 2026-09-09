# Birthday Bot

A Progressive Web App that tracks birthdays and pushes you a reminder at **8:00 AM
on the day**, from a server that keeps running whether or not the app is open.

React (Vite) + Tailwind · Express · PostgreSQL via Prisma · Web Push · built for Railway.

---

## What it does

- **Dashboard** — every birthday in chronological order, grouped Today / This week /
  This month / Later, with the age they're turning and how many days are left.
- **Add & edit** by hand, with an **optional** birth year.
- **Bulk import** — drop in a CSV or JSON export. It previews what will land and what
  it couldn't read *before* writing anything, and re-importing the same file changes
  nothing.
- **Web Push** — one button registers the device; a `node-cron` job at 08:00 sends
  *"It's Ava Bennett's birthday today! They are turning 27."* to every registered device.
- **Installable** — manifest, service worker, offline shell, iOS home-screen support.

## Quick start

```bash
cp .env.example .env          # then fill in DATABASE_URL
npm install
npm run vapid                 # prints a VAPID keypair — paste it into .env
npm run db:migrate            # create the tables
npm run dev                   # API on :8080, Vite on :5173
```

Open http://localhost:5173. For a production-shaped run (one origin, no Vite):

```bash
npm run build && npm start
```

## Deploying to Railway

**It's already deployed:** https://birthday-bot-production-9d98.up.railway.app
(project `birthday-bot`, service `birthday-bot`, plus a `Postgres` service).

Infrastructure is declared in `.railway/railway.ts` — Railway's Infrastructure as
Code. The older `railway.json` was removed: it is deprecated (unread after
2026-12-01) and, as `railway config plan` showed, it was **never actually applied**
to this service — the build only worked because Railpack auto-detects `npm run build`
and `npm start` from `package.json`.

Authoring the config needs the SDK and **Node 22+** (the evaluator uses
`--experimental-strip-types`, which Node 20 does not have):

```bash
nvm use 22
railway config plan     # preview
railway config apply    # write it to Railway
```

### From scratch

1. **Create the project** and add a **PostgreSQL** service.
2. **Add this repo** as a service. Pushing to `main` redeploys automatically.
3. **Set the variables** on the app service:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` — reference the DB service |
   | `VAPID_PUBLIC_KEY` | from `npm run vapid` |
   | `VAPID_PRIVATE_KEY` | from `npm run vapid` |
   | `VAPID_SUBJECT` | `mailto:you@example.com` |
   | `APP_TIMEZONE` | `America/Toronto` (the zone 8:00 AM means) |
   | `NOTIFY_HOUR` | `8` (optional) |
   | `TZ` | `America/Toronto` (optional — the app derives the day itself) |

   Don't set `PORT`; Railway injects it and the server binds it.
4. **Generate a domain.** Web Push requires HTTPS, which the Railway domain provides.

Verify the variables actually landed rather than trusting the command:

```bash
railway variables --service birthday-bot --kv
```

`npm start` runs `prisma migrate deploy` before booting, so a deploy applies its own
migrations. The health check is `GET /api/health`, which returns 503 while Postgres is
unreachable so a broken container doesn't take traffic.

### Install it on a phone

Open the domain, then **Add to Home Screen**, then press **Enable notifications**
from the installed app. On iOS that order matters: Safari does not expose the Push
API to a normal tab, only to an installed web app — the notification panel says so
rather than offering a button that cannot work.

## Bulk import

Any CSV or JSON with something name-shaped and something birthday-shaped:

```csv
Display Name,Birthday,Notes
Harper Quinn,04/22/1995,Met through Kai
Kai Nakamura,11/03,
Rowan Blake,1992-07-19,
```

Column names are matched loosely (`name`, `display name`, `username`, `friend`;
`birthday`, `birthdate`, `dob`, `bday`, `born`…), nested JSON is searched for the
records array, and dates parse from `1999-03-14`, `03/14/1999`, `14/03/1999`,
`March 14, 1999`, `14 March`, `3/14` and `02-29`.

> **On Snapchat specifically:** its official "My Data" export does **not** contain
> birthdays — `friends.json` only carries usernames, display names and dates the
> friendship changed. Birthdays are visible in the app under Friends → Birthdays,
> as **month and day with no year**. So the importer treats a missing year as
> normal rather than an error: those contacts show *"Age unknown"* and their
> reminder simply omits the age. Adding the year later fills it in — an import can
> complete a contact, but never overwrite a year or a note you already had.

## API

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/health` | Status, database, timezone, today. Railway's health check. |
| `GET` | `/api/contacts` | All contacts, soonest birthday first. |
| `POST` | `/api/contacts` | `{ name, birthdate, notes? }` |
| `GET` `PUT` `DELETE` | `/api/contacts/:id` | |
| `GET` | `/api/contacts/upcoming/list?days=30` | |
| `POST` | `/api/import` | CSV/JSON as `file`, or `{ contacts: [...] }`. `?dryRun=1` previews. |
| `GET` | `/api/subscriptions/public-key` | VAPID public key for the browser. |
| `GET` `POST` | `/api/subscriptions` | List devices / register one. |
| `POST` | `/api/subscriptions/unsubscribe` | `{ endpoint }` |
| `POST` | `/api/subscriptions/test` | Send a test notification now. |
| `GET` | `/api/runs` | The last 14 daily runs, for debugging a missed morning. |
| `POST` | `/api/runs/today` | Run today's job now. `?force=1` bypasses the once-a-day guard. |

**There is no authentication.** This is built as a single-user personal app on a
private URL. Before sharing the URL, put something in front of it — the smallest
version is an `Authorization` check in one middleware in `server/index.js`.

## Layout

```
.railway/railway.ts         Railway infrastructure as code
prisma/schema.prisma        Contact · Subscription · NotificationRun
prisma.config.mjs           Prisma 7 config (the DB url lives here, not in the schema)
server/
  index.js                  Express app, static client, SPA fallback, shutdown
  env.js                    Validated environment
  lib/dates.js              Civil-date maths, birthday parsing — the timezone core
  lib/push.js               web-push setup, fan-out, pruning, notification copy
  lib/import-parser.js      CSV/JSON reading, loose column matching
  routes/                   contacts · subscriptions · import · system
  jobs/birthday-job.js      The 08:00 cron job, its once-a-day guard and boot catch-up
client/
  src/App.jsx               Dashboard
  src/components/           Cards, form, import panel, notification settings, icons
  src/lib/                  api · push registration · formatting
  public/sw.js              Service worker: caching, push, notification click
scripts/
  generate-icons.mjs        Every icon slot, drawn from one vector definition
  stamp-sw.mjs              Stamps the service worker's build id
tests/                      43 tests — unit, HTTP integration, and push delivery
```

## Notes on the parts that are easy to get wrong

**The day is derived from a named timezone, not the server clock.** A Railway
container has no `TZ` and runs UTC, so `new Date().getDate()` there is the UTC day
and rolls over at 20:00 in Montreal — "today's birthdays" would go wrong every
evening, in production only. Every "today" comes from `Intl` with `APP_TIMEZONE`, so
it stays correct even if that variable is never set on the container. There's a test
that runs the app with the container clock set to a zone that is already tomorrow.

**The job can't double-send or miss a day.** It claims a `NotificationRun` row for
the date before sending, so a restart, a redeploy or a second replica can't notify
twice; and on boot it runs the catch-up if 08:00 has already passed, so a deploy at
08:05 doesn't silently skip the morning.

**Dead push subscriptions are deleted.** A subscription dies whenever someone clears
site data or reinstalls; a 404/410 removes the row immediately, and other errors
remove it after five consecutive failures.

**The service worker's build id is a hash of the built app**, not of `sw.js`. If it
hashed itself, the id would never change when you ship a feature, no browser would
ever install the new worker, and installed clients would serve a stale shell forever.

**Feb 29 is observed on Feb 28** in common years, so those reminders still land in
February. The daily query picks them up explicitly.

**Bad VAPID keys disable push, they don't crash the app.** `web-push` throws on a
malformed keypair; unguarded that happens at import and takes down the health check
too, turning one mistyped variable into a failed deploy.

## Tests

```bash
npm test
```

Unit tests always run. The HTTP and push-delivery suites need a database — they use
`TEST_DATABASE_URL` (default `postgresql://localhost:5432/birthday_bot_test`) and
skip with a reason if none is reachable.

```bash
createdb birthday_bot_test
DATABASE_URL=postgresql://localhost:5432/birthday_bot_test npx prisma migrate deploy
```

The push suite is the interesting one: it intercepts the HTTPS call, checks the VAPID
signature, **decrypts the RFC 8291 payload** to confirm the exact words that reach the
phone, then feeds that payload to the built service worker in a sandbox and asserts
what it displays.
