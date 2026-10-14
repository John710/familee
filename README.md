# Familee — family tree

*Read this in another language: [Русский](README.ru.md)*

An application for keeping a family archive: people, unions, events, places, sources and
photographs. The tree is drawn visually — cards with a photo and a full name, and clicking a card
opens it for editing. The interface is multilingual; every string lives in `messages/*.json`.

Everything runs on your own server in a single Docker container and connects to the Postgres and
Redis containers that already run there — it never starts containers of its own for them. You choose
how it is reached: by the server's IP address and a port (the default), or behind Traefik over HTTPS
with a domain of your own.

## What it does

- **People and families.** Persons with names, sex, birth and death dates, written the way people
  write them ("about 1901", "1921-04-12"), notes, additional names and other events with places.
  Unions with partners and children; a cycle guard refuses a loop in the ancestry.
- **The tree.** Cards with a photograph and the years, drawn from top to bottom. A click opens a
  panel with the timeline, the notes and the album. Focus mode shows the ancestors and descendants
  of one person; "relation to me" names how each card is related to the person chosen as oneself;
  search centres the tree on a match. Ages are shown for the living (today's) and for the dead (the
  age they reached).
- **Photographs.** An album per person, one main photograph, a crop of the square the card shows,
  photographs of events, and a gallery of the whole tree.
- **Library.** Places (with the part-of hierarchy), sources and citations for people and events,
  notes and stories, and search over the whole archive.
- **Birthdays.** The next two weeks across all trees: a bell in the top bar, the home page, the tree,
  the members and the persons pages.
- **GEDCOM.** Import of a file of any version (the version is read from its header), with a preview
  and a confirmation; export of a tree as GEDCOM 7.0.
- **Access.** Roles per tree (owner, administrator, co-author, viewer), invitations, a password reset
  handed out by an administrator, the change history for owners and administrators, and the list of
  devices a person is signed in on.

## What is inside

Next.js 16.4 (App Router, server actions) on React 19.3 and TypeScript 7. Data lives in Postgres and
is queried through Drizzle ORM over the postgres.js driver. Sign-in is handled by better-auth:
sessions live in Postgres and are cached in Redis (ioredis). Styling is Tailwind CSS 4 together with
daisyUI 5 and shadcn/ui components built on radix-ui. Translations are next-intl. Linting and
formatting are Biome. The tree is drawn by @xyflow/react; its layout is our own code in
`src/lib/tree-layout.ts`. Photo previews are made by sharp.

Every dependency is pinned to an exact version (no `^`) in `package.json`, and `package-lock.json`
fixes the whole tree. An upgrade should be a deliberate act, not a side effect of rebuilding the
image.

## Server requirements

- Docker with the compose plugin.
- Postgres (with the contrib extensions `pgcrypto`, `pg_trgm` and `btree_gin` available) and Redis
  already running, reachable by container name from one Docker network (`DATA_NETWORK`).
- Optional: Traefik, if you want HTTPS on a domain. Without it the archive is reached by IP address.

The application joins the data network and reaches the services by container name.

## First run

**1. Database.** Connect to the shared Postgres as a superuser and create the role and the database:

```sql
create role familee with login password 'pick_a_password';
create database familee owner familee;
```

Then connect to the `familee` database (still as a superuser) and enable the extensions — an
ordinary role is not allowed to do this:

```sql
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists btree_gin;
```

A dedicated database is optional. Every object of the application lives in the `familee` schema, so
the schema can just as well be created inside an existing database. In that case the role needs the
`create` privilege on that database and `DATABASE_URL` points at the existing database name.

**2. Configuration.** Copy `.env.example` to `.env` (mode `600`) and fill it in. Set `DATABASE_URL`,
`REDIS_URL`, `DATA_NETWORK` and `BETTER_AUTH_SECRET` (`openssl rand -base64 48`).

**3. How the archive is reached.** Choose one of two modes in `.env`:

- **By IP address (default).** The application is published on `FAMILEE_PORT` (3000 by default)
  of the server, over plain HTTP. Set `BETTER_AUTH_URL=http://<server-ip>:<FAMILEE_PORT>`. Nothing
  else is needed. Plain HTTP is only suitable for a private network; for the internet put an HTTPS
  proxy in front of the application.
- **Behind Traefik over HTTPS.** Set `FAMILEE_HOST` to your domain, `BETTER_AUTH_URL=https://<domain>`,
  and enable the overlay file in `.env`:

  ```bash
  COMPOSE_FILE=docker-compose.yml:docker-compose.traefik.yml
  ```

  Set `TRUSTED_PROXIES` to the subnet of that network (for example `192.168.90.0/24`), so the
  sign-in limit sees the client's own address. Leave it empty in the address-and-port mode.
  The overlay joins the proxy network `TRAEFIK_NETWORK`, adds the routing labels for the domain, and
  removes the published port, so the application is reachable only through Traefik. The entrypoint and
  the certificate resolver are set by `TRAEFIK_ENTRYPOINT` and `TRAEFIK_CERTRESOLVER`.

`BETTER_AUTH_URL` must match the address the browser uses, scheme and port included. Otherwise sign-in
is refused as coming from another origin.

**4. Build, schema, start.**

```bash
docker compose build
docker compose --profile tools run --rm migrate    # applies db/migrations/*.sql
docker compose up -d
docker compose logs -f app
```

The `migrate` service is a throwaway container that carries nothing but `psql`, so there is no need
to install a client on the server. Migrations are idempotent: re-running them is safe and is meant
to happen after every code update.

**5. Demo data (optional).** `db/seed.sql` creates a fictional family spanning four generations,
including a second marriage, a stepson and approximate or incomplete dates. It is a convenient way
to see what the tree looks like before you have entered anything of your own.

```bash
docker compose --profile tools run --rm migrate seed
```

The script deletes the tree with the slug `demo` in full and recreates it on every run. Real trees
are left alone.

## Accounts and access

Public sign-up is closed. The first person opens `<BETTER_AUTH_URL>/setup` once and creates
the administrator; the page answers 404 from then on. Everyone else receives an invitation link from
an owner or administrator of a tree. The link is valid for 7 days and works once; the token is shown
only at creation and stored as a hash.

Roles are granted per tree: owner, administrator, co-author (the `editor` role), viewer. An invitation can grant
any role except owner. An owner or an administrator changes a member's role or revokes access on the members
page; an administrator cannot touch another administrator or the owner, and nobody changes their own access
there. Each person sees the devices they are signed in on in the profile and can end any of them.

`BETTER_AUTH_URL` must be the address the browser uses, port included (for example
`http://192.168.0.10:3000` or `https://archive.example.com`). Otherwise better-auth rejects the requests
as coming from another origin.

## Time zone

`APP_TIME_ZONE` is an IANA name; the default is `Asia/Vladivostok`. It sets the container's `TZ`,
which Node.js uses for every displayed time. The birthdays of the next two weeks (the bell, the home
page, the tree, the members and the persons pages) are counted from the day in this zone.

## Migrations and database tests

**The source of truth is the hand-written SQL in `db/migrations/`.** It holds far more than tables:
triggers, the tree traversal functions (`familee.ancestors`, `familee.descendants`,
`familee.kinship`), the `familee.parent_child` and `familee.person_cards` views, the fuzzy-date
checks and the guard against cycles in parentage. Drizzle is used only as a typed query builder and
mirrors that SQL by hand, file by file.

That is why **`drizzle-kit generate` must never be run**: it cannot see hand-written functions and
triggers, so it would generate a migration that drops them. Only the safe commands are wired up:

```bash
npm run db:check     # compare the Drizzle schema against the database
npm run db:pull      # see what the database actually contains
npm run db:studio    # browse the data
```

A schema change is introduced in two steps: first a new `db/migrations/000N_*.sql` file
(idempotent, with its own transaction and a row in `familee.schema_migrations`), then the matching
module in `src/db/schema/`. Constraint and index names must be identical in the SQL and in Drizzle —
that is what `db:check` relies on.

The database tests live in `db/tests/smoke.sql`. They check the demo tree, the ancestor walk, the
kinship function and the guard against cycles. Every check runs inside a transaction that is rolled
back, so the data stays as it was:

```bash
docker compose --profile tools run --rm migrate seed test
```

## Languages

Adding a language takes exactly two steps: drop in `messages/<code>.json` (the easiest start is a
copy of `messages/en.json`) and add the code to the `locales` array in `src/i18n/routing.ts`.

The file does not have to be translated in full. Any missing or empty key falls back to the default
locale, so a half-translated file cannot break the interface — `withFallback` in
`src/i18n/request.ts` takes care of that. `npm run test:i18n` checks that the catalogues have the
same keys.

The database contains no human-readable labels at all. Enum values, event types and kinship degrees
are stored as keys (`male`, `birth`, `marriage`), and their captions live under `enums.*` and
`events.*` in the message files. `familee.kinship()` returns two numbers — how many generations up
and how many down — and the phrase "second cousin" is composed by the application from `kinship.*`.
Because of that a new language needs no migration whatsoever.

The project itself — comments, identifiers, documentation — is written in English. The only Russian
files are `messages/ru.json` and [README.ru.md](README.ru.md).

## License

Familee is released under the [MIT License](LICENSE). You may use, copy, modify, fork and redistribute
it, including for commercial purposes, as long as the copyright and permission notice stay in place.

## Backups

The data lives in two places: the `familee` schema in Postgres and the `familee_media` volume with
the original photographs and their previews.

```bash
docker exec -t postgres pg_dump -U <superuser> --schema=familee --format=custom familee \
    > familee-$(date +%F).dump

docker run --rm -v familee_media:/data:ro -v "$PWD:/backup" alpine \
    tar czf /backup/familee-media-$(date +%F).tar.gz -C /data .
```

## What comes next

The main open items now: browser checks of the newest features,
citations for families and places, and a check of the layout on real family data.
