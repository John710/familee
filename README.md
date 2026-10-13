# Familee — family tree

*Read this in another language: [Русский](README.ru.md)*

An application for keeping a family archive: people, unions, events, places, sources and
photographs. The tree is drawn visually — cards with a photo and a full name, and clicking a card
opens it for editing. The interface is multilingual; every string lives in `messages/*.json`.

Everything runs on your own server in a single Docker container and connects to **already running**
Postgres, Redis and traefik — it never spins up containers of its own for them.

## What is inside

Next.js 16 (App Router, server actions) on React 19 and TypeScript 7. Data lives in Postgres and is
queried through Drizzle ORM over the postgres.js driver. Sessions are kept in Redis (ioredis),
sign-in is handled by better-auth. Styling is Tailwind CSS 4 together with daisyUI 5 and shadcn/ui
components built on radix-ui. The tree is rendered by @xyflow/react and laid out by d3-hierarchy.
Photo previews are produced by sharp. Translations are next-intl. Linting and formatting are Biome.

Every dependency is pinned to an exact version (no `^`) in `package.json`: an upgrade should be a
deliberate act, not a side effect of rebuilding the image.

## Server requirements

Docker with the compose plugin. Already running Postgres (with the contrib extensions available),
Redis and traefik. The application joins their Docker networks and therefore reaches them by
container name.

## First run

**1. Database.** Connect to your Postgres as a superuser and create the role and the database:

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

**2. Configuration.** Copy `.env.example` to `.env` and fill it in. `DATABASE_URL`, `REDIS_URL`,
`FAMILEE_HOST` and `BETTER_AUTH_SECRET` (`openssl rand -base64 48`) must be changed. The network
names for `DATA_NETWORK` and `CACHE_NETWORK` can be looked up like this:

```bash
docker inspect -f '{{range $n,$_ := .NetworkSettings.Networks}}{{$n}} {{end}}' postgres
docker inspect -f '{{range $n,$_ := .NetworkSettings.Networks}}{{$n}} {{end}}' redis
```

If Postgres and Redis share a single network, keep only `DATA_NETWORK` and drop the `cache` network
from `docker-compose.yml` — there is a note about it in the file.

**3. Build, schema, start.**

```bash
docker compose build
docker compose run --rm migrate     # applies db/migrations/*.sql
docker compose up -d
docker compose logs -f app
```

The `migrate` service is a throwaway container that carries nothing but `psql`, so there is no need
to install a client on the server. Migrations are idempotent: re-running them is safe and is meant
to happen after every code update.

**4. Demo data (optional).** `db/seed.sql` creates a fictional family spanning four generations,
including a second marriage, a stepson and approximate or incomplete dates. It is a convenient way
to see what the tree looks like before you have entered anything of your own.

```bash
docker compose run --rm migrate seed
```

The script deletes the tree with the slug `demo` in full and recreates it on every run. Real trees
are left alone.

## Migrations

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
npm run db:apply     # same as the migrate service, if psql is available locally
```

A schema change is introduced in two steps: first a new `db/migrations/000N_*.sql` file
(idempotent, with its own transaction and a row in `familee.schema_migrations`), then the matching
module in `src/db/schema/`. Constraint and index names must be identical in the SQL and in Drizzle —
that is what `db:check` relies on.

## Languages

Adding a language takes exactly two steps: drop in `messages/<code>.json` (the easiest start is a
copy of `messages/en.json`) and add the code to the `locales` array in `src/i18n/routing.ts`.

The file does not have to be translated in full. Any missing or empty key falls back to the default
locale, so a half-translated file cannot break the interface — `withFallback` in
`src/i18n/request.ts` takes care of that.

The database contains no human-readable labels at all. Enum values, event types and kinship degrees
are stored as keys (`male`, `birth`, `marriage`), and their captions live under `enums.*` and
`events.*` in the message files. `familee.kinship()` returns two numbers — how many generations up
and how many down — and the phrase "second cousin" is composed by the application from `kinship.*`.
Because of that a new language needs no migration whatsoever.

The project itself — comments, identifiers, documentation — is written in English. The only Russian
files are `messages/ru.json` and [README.ru.md](README.ru.md).

## Styling

The palette is declared once, as the two daisyUI themes (`light` and `dark`) in
`src/app/globals.css`. The names that shadcn/ui components expect (`bg-background`,
`text-muted-foreground`, `border-border`) are declared in the same file inside `@theme inline` and
**reference** the daisyUI colours. That keeps both libraries in agreement and leaves a single place
to edit.

Two details are easy to "fix" by mistake. First, the names shared by both libraries (`primary`,
`secondary`, `accent`, `info`, `success`, `warning`, `error`) are never redefined inside
`@theme inline` — doing so creates a circular reference and the colours vanish. Second, `accent`
here is not a third brand colour but the quiet background of a highlighted menu row: that is what
shadcn/ui means by it, and that is how it is used most often. The brand colours are `primary`
(green) and `secondary` (terracotta).

Themes are switched by next-themes, which sets both `class="dark"` (for Tailwind's `dark:`) and
`data-theme="dark"` (for daisyUI) on `<html>` in one go.

## Development

Locally the application needs the same Postgres and Redis, so the simplest approach is to forward
them from the server over ssh and point `.env` at `127.0.0.1`:

```bash
ssh -N -L 5432:localhost:5432 -L 6379:localhost:6379 server
npm install
npm run dev
```

Checks before a commit:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # biome check .
npm run format      # biome check --write .
```

Biome replaces ESLint and Prettier: one dependency instead of a dozen, no peer-dependency graph
(ESLint 10 with typescript-eslint currently conflicts on install), and import and Tailwind class
sorting come along for free (`useSortedClasses` in `biome.json`).

## Backups

The data lives in two places: the `familee` schema in Postgres and the `familee_media` volume with
the original photographs and their previews.

```bash
docker exec -t postgres pg_dump -U familee --schema=familee --format=custom familee \
    > familee-$(date +%F).dump

docker run --rm -v familee_media:/data:ro -v "$PWD:/backup" alpine \
    tar czf /backup/familee-media-$(date +%F).tar.gz -C /data .
```

## What comes next

The database schema and the application skeleton are done. Next, in order: sign-in and roles
(better-auth with sessions in Redis), the visual tree on @xyflow/react with photo cards laid out by
d3-hierarchy, opening a card for editing, photo upload with sharp-generated previews, and GEDCOM
import and export.

One small thing for later: Next.js 16 may suggest at startup that `src/middleware.ts` be renamed to
`src/proxy.ts` — renaming the file is enough, the contents stay as they are.
