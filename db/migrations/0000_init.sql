-- =====================================================================
--  Familee - an application for keeping a family tree
--  Migration 0000: extensions, schema, enums, tables
--
--  Requires: PostgreSQL 15+
--  Idempotent: re-running it does not break an existing schema.
--
--  Everything lives in the separate `familee` schema, so the migration can be
--  applied to a database that already exists on the server without touching it.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy search over names (typos)
create extension if not exists btree_gin;  -- composite GIN indexes

create schema if not exists familee;

comment on schema familee is 'Familee: family tree - persons, unions, events, media, sources';

-- ---------------------------------------------------------------------
-- Log of applied migrations
-- ---------------------------------------------------------------------
create table if not exists familee.schema_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Enums
--
-- Value labels are NOT stored in the database - they live in messages/<lang>.json
-- (keys such as `enums.sex.male`), so that users can add their own language
-- without changing the schema.
-- ---------------------------------------------------------------------

do $$ begin
    create type familee.app_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.member_role as enum ('owner', 'admin', 'editor', 'contributor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.privacy_level as enum ('public', 'members', 'private');
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.sex as enum ('male', 'female', 'other', 'unknown');
exception when duplicate_object then null; end $$;

-- Name record type: one person may hold several names
-- (maiden/married, pseudonym, a name in another language).
do $$ begin
    create type familee.name_type as enum (
        'birth',            -- name at birth
        'married',          -- name in marriage
        'maiden',           -- maiden surname
        'also_known_as',    -- also known as
        'nickname',         -- nickname
        'religious',        -- religious or monastic name
        'immigrant',        -- name taken after moving
        'legal',            -- legally changed
        'transliteration',  -- the same record in another language or script
        'other'
    );
exception when duplicate_object then null; end $$;

-- Union type. Partners are kept in family_partners, so the model describes a
-- marriage, a cohabitation and a single parent in exactly the same way.
do $$ begin
    create type familee.family_type as enum (
        'marriage',         -- registered marriage
        'partnership',      -- cohabitation, common-law marriage
        'civil_union',      -- civil partnership
        'single_parent',    -- one parent, the other unknown
        'unknown'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.family_status as enum (
        'active', 'divorced', 'annulled', 'widowed', 'separated', 'unknown'
    );
exception when duplicate_object then null; end $$;

-- Role in a union. 'partner' covers the cases where husband/wife do not
-- apply or the sex is unknown.
do $$ begin
    create type familee.partner_role as enum ('husband', 'wife', 'partner', 'unknown');
exception when duplicate_object then null; end $$;

-- How a child is linked to a union (GEDCOM PEDI).
do $$ begin
    create type familee.child_relation as enum (
        'biological', 'adopted', 'step', 'foster', 'guardianship', 'sealing', 'unknown'
    );
exception when duplicate_object then null; end $$;

-- Fuzzy dates: in genealogy an exact date is the exception rather than the rule.
do $$ begin
    create type familee.date_qualifier as enum (
        'exact',        -- 12.03.1901
        'about',        -- about 1901
        'before',       -- before 1901
        'after',        -- after 1901
        'between',      -- between 1901 and 1905 (needs date_start and date_end)
        'from_to',      -- from 1901 to 1905 (a period, not uncertainty)
        'estimated',    -- the researcher's estimate
        'calculated',   -- derived from an age given in a document
        'unknown'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.date_precision as enum ('day', 'month', 'year', 'decade', 'century');
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.calendar as enum (
        'gregorian', 'julian', 'hebrew', 'french_republican', 'unknown'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.event_scope as enum ('person', 'family', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.place_kind as enum (
        'country', 'region', 'oblast', 'krai', 'republic', 'district', 'city',
        'town', 'village', 'settlement', 'street', 'building', 'cemetery',
        'church', 'hospital', 'other'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.media_kind as enum ('photo', 'document', 'audio', 'video', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.media_variant as enum ('thumb', 'small', 'medium', 'large', 'original');
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.media_role as enum (
        'portrait', 'gallery', 'document', 'headstone', 'signature', 'other'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type familee.audit_action as enum (
        'create', 'update', 'delete', 'restore', 'merge', 'import', 'export'
    );
exception when duplicate_object then null; end $$;


-- =====================================================================
--  USERS AND ACCESS
--
--  The tables are compatible with better-auth (see src/lib/auth.ts: modelName
--  renames them to plural, fields renames the columns to snake_case).
-- =====================================================================

create table if not exists familee.users (
    id              text primary key,                    -- id is generated by better-auth
    name            text not null default '',
    email           text not null,
    email_verified  boolean not null default false,
    image           text,
    role            familee.app_role not null default 'viewer',
    locale          text not null default 'ru',          -- interface language
    banned          boolean not null default false,
    ban_reason      text,
    ban_expires     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint users_email_key unique (email),
    constraint users_locale_format check (locale ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$')
);

comment on column familee.users.role is
    'Global role. Rights on a particular tree are granted in familee.tree_members';

create table if not exists familee.sessions (
    id          text primary key,
    token       text not null,
    user_id     text not null references familee.users (id) on delete cascade,
    expires_at  timestamptz not null,
    ip_address  text,
    user_agent  text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint sessions_token_key unique (token)
);

create index if not exists sessions_user_id_idx on familee.sessions (user_id);
create index if not exists sessions_expires_at_idx on familee.sessions (expires_at);

create table if not exists familee.accounts (
    id                        text primary key,
    account_id                text not null,
    provider_id               text not null,
    user_id                   text not null references familee.users (id) on delete cascade,
    access_token              text,
    refresh_token             text,
    id_token                  text,
    access_token_expires_at   timestamptz,
    refresh_token_expires_at  timestamptz,
    scope                     text,
    password                  text,       -- scrypt hash for the credentials provider
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now(),
    constraint accounts_provider_account_key unique (provider_id, account_id)
);

create index if not exists accounts_user_id_idx on familee.accounts (user_id);

create table if not exists familee.verifications (
    id          text primary key,
    identifier  text not null,
    value       text not null,
    expires_at  timestamptz not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists verifications_identifier_idx on familee.verifications (identifier);


-- =====================================================================
--  TREES (projects)
--
--  A single installation can keep several independent trees: the father's
--  line, the mother's line, a friend's tree and so on.
-- =====================================================================

create table if not exists familee.trees (
    id              uuid primary key default gen_random_uuid(),
    slug            text not null,
    title           text not null,
    description     text,
    default_locale  text not null default 'ru',

    -- Privacy of the living: hide details until death is proven
    hide_living         boolean not null default true,
    living_cutoff_years int not null default 100,

    created_by      text references familee.users (id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint trees_slug_key unique (slug),
    constraint trees_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    constraint trees_cutoff_sane check (living_cutoff_years between 1 and 200)
);


-- =====================================================================
--  PERSONS
-- =====================================================================

create table if not exists familee.persons (
    id          uuid primary key default gen_random_uuid(),
    tree_id     uuid not null references familee.trees (id) on delete cascade,
    sex         familee.sex not null default 'unknown',

    -- null = unknown. The application can infer the value from the birth date
    -- and trees.living_cutoff_years, but a value set by hand wins.
    is_living   boolean,

    privacy     familee.privacy_level not null default 'members',

    -- A short caption under the name on a tree card: "doctor", "founder of the line"
    headline    text,
    notes       text,

    -- The identifier from a GEDCOM file: needed to re-import without duplicates
    gedcom_xref text,

    -- Manual ordering of cards for the cases where dates are unknown
    sort_order  int,

    created_by  text references familee.users (id) on delete set null,
    updated_by  text references familee.users (id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    -- Needed for the composite foreign keys: it guarantees that a relation
    -- can never join persons belonging to different trees.
    constraint persons_tree_id_id_key unique (tree_id, id),
    constraint persons_gedcom_xref_key unique (tree_id, gedcom_xref)
);

create index if not exists persons_tree_id_idx on familee.persons (tree_id);
create index if not exists persons_tree_sort_idx on familee.persons (tree_id, sort_order nulls last);

-- Names. A separate table, because a person often has more than one:
-- maiden and married, Cyrillic and Latin spelling, a monastic name.
create table if not exists familee.person_names (
    id                uuid primary key default gen_random_uuid(),
    person_id         uuid not null references familee.persons (id) on delete cascade,
    type              familee.name_type not null default 'birth',
    is_primary        boolean not null default false,

    -- The name itself
    surname           text,   -- family name
    given             text,   -- given name
    patronymic        text,   -- patronymic

    -- additional parts
    prefix            text,   -- title or rank: "princess", "doctor"
    suffix            text,   -- "junior", "III"
    nickname          text,   -- nickname, the name used at home
    surname_at_birth  text,   -- maiden surname when type = 'married'

    -- Language of the record. Lets one person be stored twice, once in
    -- Cyrillic and once in Latin script, as two rows.
    locale            text,

    notes             text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    -- The ready-made "Surname Given Patronymic" string for cards and lists.
    -- concat_ws() must not be used here: it is STABLE, not IMMUTABLE.
    display text generated always as (
        btrim(
            coalesce(nullif(btrim(surname),    '') || ' ', '') ||
            coalesce(nullif(btrim(given),      '') || ' ', '') ||
            coalesce(nullif(btrim(patronymic), ''),       '')
        )
    ) stored,

    -- Search. The 'simple' configuration rather than 'russian': surnames must
    -- not be reduced to a stem, and stemming mangles non-Russian names.
    search_vector tsvector generated always as (
        to_tsvector('simple',
            coalesce(surname, '')          || ' ' ||
            coalesce(given, '')            || ' ' ||
            coalesce(patronymic, '')       || ' ' ||
            coalesce(nickname, '')         || ' ' ||
            coalesce(surname_at_birth, '')
        )
    ) stored,

    constraint person_names_not_empty check (
        coalesce(btrim(surname),  '') <> '' or
        coalesce(btrim(given),    '') <> '' or
        coalesce(btrim(nickname), '') <> ''
    ),
    constraint person_names_locale_format check (
        locale is null or locale ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'
    )
);

create index if not exists person_names_person_id_idx on familee.person_names (person_id);

-- Exactly one primary name per person
create unique index if not exists person_names_primary_key
    on familee.person_names (person_id) where is_primary;

create index if not exists person_names_search_idx
    on familee.person_names using gin (search_vector);

-- Typo-tolerant search: a misspelled surname still finds the right person
create index if not exists person_names_surname_trgm_idx
    on familee.person_names using gin (surname gin_trgm_ops);
create index if not exists person_names_display_trgm_idx
    on familee.person_names using gin (display gin_trgm_ops);


-- =====================================================================
--  UNIONS (families) AND PARENTAGE
--
--  Parentage is described through a union rather than "mother/father" fields
--  on the person. That stores remarriages, same-sex couples, adopted children
--  and single parents with no workarounds at all.
-- =====================================================================

create table if not exists familee.families (
    id          uuid primary key default gen_random_uuid(),
    tree_id     uuid not null references familee.trees (id) on delete cascade,
    type        familee.family_type not null default 'marriage',
    status      familee.family_status not null default 'unknown',
    notes       text,
    gedcom_xref text,
    created_by  text references familee.users (id) on delete set null,
    updated_by  text references familee.users (id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint families_tree_id_id_key unique (tree_id, id),
    constraint families_gedcom_xref_key unique (tree_id, gedcom_xref)
);

create index if not exists families_tree_id_idx on familee.families (tree_id);

-- Partners of a union. Usually two, but one is allowed as well
-- (the second parent being unknown).
create table if not exists familee.family_partners (
    tree_id     uuid not null,
    family_id   uuid not null,
    person_id   uuid not null,
    role        familee.partner_role not null default 'unknown',
    sort_order  smallint not null default 0,
    created_at  timestamptz not null default now(),

    primary key (family_id, person_id),

    -- The composite keys guarantee that partner and union share one tree
    constraint family_partners_family_fk foreign key (tree_id, family_id)
        references familee.families (tree_id, id) on delete cascade,
    constraint family_partners_person_fk foreign key (tree_id, person_id)
        references familee.persons (tree_id, id) on delete cascade
);

create index if not exists family_partners_person_idx on familee.family_partners (person_id);
create index if not exists family_partners_tree_idx on familee.family_partners (tree_id);

-- Children of a union
create table if not exists familee.family_children (
    tree_id     uuid not null,
    family_id   uuid not null,
    person_id   uuid not null,
    relation    familee.child_relation not null default 'biological',

    -- For the case where the link differs per parent: a child is biological
    -- for the mother and adopted by the father. Format: {"<partner person_id>": "adopted"}
    relation_by_partner jsonb not null default '{}'::jsonb,

    birth_order smallint,
    notes       text,
    created_at  timestamptz not null default now(),

    primary key (family_id, person_id),

    constraint family_children_family_fk foreign key (tree_id, family_id)
        references familee.families (tree_id, id) on delete cascade,
    constraint family_children_person_fk foreign key (tree_id, person_id)
        references familee.persons (tree_id, id) on delete cascade,
    constraint family_children_relation_by_partner_object
        check (jsonb_typeof(relation_by_partner) = 'object')
);

create index if not exists family_children_person_idx on familee.family_children (person_id);
create index if not exists family_children_tree_idx on familee.family_children (tree_id);


-- =====================================================================
--  PLACES
-- =====================================================================

create table if not exists familee.places (
    id            uuid primary key default gen_random_uuid(),
    tree_id       uuid not null references familee.trees (id) on delete cascade,
    parent_id     uuid references familee.places (id) on delete set null,
    name          text not null,
    kind          familee.place_kind not null default 'other',

    -- The full name with its hierarchy ("Tula, Tula Oblast, Russia").
    -- Recomputed by a trigger defined in 0001_functions.sql.
    full_name     text,

    latitude      numeric(9, 6),
    longitude     numeric(9, 6),

    -- Historical names: Saint Petersburg / Petrograd / Leningrad
    former_names  text[] not null default '{}',

    notes         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint places_no_self_parent check (parent_id is null or parent_id <> id),
    constraint places_name_not_empty check (btrim(name) <> ''),
    constraint places_lat_range check (latitude is null or latitude between -90 and 90),
    constraint places_lon_range check (longitude is null or longitude between -180 and 180)
);

create index if not exists places_tree_id_idx on familee.places (tree_id);
create index if not exists places_parent_id_idx on familee.places (parent_id);
create index if not exists places_name_trgm_idx on familee.places using gin (name gin_trgm_ops);


-- =====================================================================
--  EVENTS AND FACTS
--
--  The type dictionary is a table rather than an enum: a user can add an event
--  type of their own without changing the schema. Labels come from
--  messages/<lang>.json by the key `events.<code>`; custom types fall back to label_fallback.
-- =====================================================================

create table if not exists familee.event_types (
    code            text primary key,
    applies_to      familee.event_scope not null default 'person',
    has_value       boolean not null default false,  -- carries a text value (occupation, rank)
    is_vital        boolean not null default false,  -- a key event of a life
    gedcom_tag      text,
    sort_order      smallint not null default 100,
    is_custom       boolean not null default false,
    label_fallback  text,                            -- label used when no translation exists
    created_at      timestamptz not null default now(),

    constraint event_types_code_format check (code ~ '^[a-z][a-z0-9_]{0,48}$')
);

create table if not exists familee.events (
    id            uuid primary key default gen_random_uuid(),
    tree_id       uuid not null references familee.trees (id) on delete cascade,
    type_code     text not null references familee.event_types (code) on update cascade,

    -- An event belongs either to a person or to a union - to exactly one of them
    person_id     uuid,
    family_id     uuid,

    place_id      uuid references familee.places (id) on delete set null,

    value         text,     -- the value of the fact: occupation, rank, document number
    description   text,
    age_text      text,     -- age as written in the source: "45 years", "18 months"

    -- Fuzzy date
    date_qualifier  familee.date_qualifier not null default 'exact',
    date_precision  familee.date_precision not null default 'day',
    calendar        familee.calendar not null default 'gregorian',
    date_start      date,
    date_end        date,
    date_original   text,   -- as written in the source: "spring 1912"

    -- For ordering in time: a single date instead of a range
    sort_date date generated always as (coalesce(date_start, date_end)) stored,

    -- The primary event of this type (one birth, one death)
    is_primary    boolean not null default false,

    created_by    text references familee.users (id) on delete set null,
    updated_by    text references familee.users (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    -- MATCH SIMPLE: when person_id is null the check is skipped
    constraint events_person_fk foreign key (tree_id, person_id)
        references familee.persons (tree_id, id) on delete cascade,
    constraint events_family_fk foreign key (tree_id, family_id)
        references familee.families (tree_id, id) on delete cascade,

    constraint events_subject_xor check (
        (person_id is not null)::int + (family_id is not null)::int = 1
    ),
    constraint events_date_order check (
        date_start is null or date_end is null or date_start <= date_end
    ),
    constraint events_between_needs_range check (
        date_qualifier <> 'between' or (date_start is not null and date_end is not null)
    ),
    constraint events_from_to_needs_range check (
        date_qualifier <> 'from_to' or date_start is not null
    ),
    constraint events_unknown_has_no_date check (
        date_qualifier <> 'unknown' or (date_start is null and date_end is null)
    )
);

create index if not exists events_person_type_idx on familee.events (person_id, type_code);
create index if not exists events_family_type_idx on familee.events (family_id, type_code);
create index if not exists events_tree_sort_date_idx on familee.events (tree_id, sort_date nulls last);
create index if not exists events_place_idx on familee.events (place_id);

-- At most one primary event of each type
create unique index if not exists events_person_primary_key
    on familee.events (person_id, type_code) where is_primary and person_id is not null;
create unique index if not exists events_family_primary_key
    on familee.events (family_id, type_code) where is_primary and family_id is not null;


-- =====================================================================
--  MEDIA
--
--  The files live in a volume on the server; the database holds metadata only.
--  storage_key: <tree_id>/<ab>/<cd>/<sha256>.<ext>
-- =====================================================================

create table if not exists familee.media (
    id                 uuid primary key default gen_random_uuid(),
    tree_id            uuid not null references familee.trees (id) on delete cascade,
    kind               familee.media_kind not null default 'photo',

    storage_key        text not null,
    checksum_sha256    char(64) not null,
    original_filename  text,
    mime_type          text not null,
    byte_size          bigint not null,
    width              int,
    height             int,

    title              text,
    description        text,
    place_id           uuid references familee.places (id) on delete set null,

    -- When it was taken - a fuzzy date as well
    taken_qualifier    familee.date_qualifier not null default 'exact',
    taken_precision    familee.date_precision not null default 'day',
    taken_start        date,
    taken_end          date,
    taken_original     text,

    exif               jsonb,

    uploaded_by        text references familee.users (id) on delete set null,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),

    -- The same file cannot be uploaded into one tree twice
    constraint media_checksum_key unique (tree_id, checksum_sha256),
    constraint media_storage_key_key unique (storage_key),
    constraint media_byte_size_positive check (byte_size > 0),
    constraint media_checksum_format check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
    constraint media_dimensions_positive check (
        (width is null or width > 0) and (height is null or height > 0)
    ),
    constraint media_taken_order check (
        taken_start is null or taken_end is null or taken_start <= taken_end
    )
);

create index if not exists media_tree_idx on familee.media (tree_id, created_at desc);
create index if not exists media_place_idx on familee.media (place_id);

-- Derived sizes that sharp generates on upload
create table if not exists familee.media_variants (
    id           uuid primary key default gen_random_uuid(),
    media_id     uuid not null references familee.media (id) on delete cascade,
    variant      familee.media_variant not null,
    format       text not null,          -- 'avif', 'webp', 'jpeg'
    storage_key  text not null,
    width        int not null,
    height       int not null,
    byte_size    bigint not null,
    created_at   timestamptz not null default now(),

    constraint media_variants_key unique (media_id, variant, format),
    constraint media_variants_storage_key_key unique (storage_key),
    constraint media_variants_positive check (width > 0 and height > 0 and byte_size > 0)
);

-- Linking media to entities.
-- crop_* gives the frame area in fractions from 0 to 1: a single group photo
-- yields a portrait for everyone who appears on it.
create table if not exists familee.media_links (
    id          uuid primary key default gen_random_uuid(),
    media_id    uuid not null references familee.media (id) on delete cascade,

    person_id   uuid references familee.persons (id) on delete cascade,
    family_id   uuid references familee.families (id) on delete cascade,
    event_id    uuid references familee.events (id) on delete cascade,
    place_id    uuid references familee.places (id) on delete cascade,
    source_id   uuid,   -- the foreign key is added below, once sources exists

    role        familee.media_role not null default 'gallery',

    -- The photo shown on the card in the tree
    is_primary  boolean not null default false,

    crop_x      numeric(6, 5),
    crop_y      numeric(6, 5),
    crop_w      numeric(6, 5),
    crop_h      numeric(6, 5),

    caption     text,
    sort_order  int not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint media_links_target_xor check (
        (person_id is not null)::int + (family_id is not null)::int +
        (event_id  is not null)::int + (place_id  is not null)::int +
        (source_id is not null)::int = 1
    ),
    constraint media_links_crop_complete check (
        (crop_x is null and crop_y is null and crop_w is null and crop_h is null) or
        (crop_x is not null and crop_y is not null and crop_w is not null and crop_h is not null)
    ),
    constraint media_links_crop_range check (
        crop_x is null or (
            crop_x >= 0 and crop_y >= 0 and crop_w > 0 and crop_h > 0 and
            crop_x + crop_w <= 1 and crop_y + crop_h <= 1
        )
    )
);

create index if not exists media_links_media_idx on familee.media_links (media_id);
create index if not exists media_links_person_idx on familee.media_links (person_id, sort_order);
create index if not exists media_links_family_idx on familee.media_links (family_id);
create index if not exists media_links_event_idx on familee.media_links (event_id);

-- One main photo per person and one link of a file to a person
create unique index if not exists media_links_person_primary_key
    on familee.media_links (person_id) where is_primary and person_id is not null;
create unique index if not exists media_links_media_person_key
    on familee.media_links (media_id, person_id) where person_id is not null;


-- =====================================================================
--  SOURCES AND CITATIONS
-- =====================================================================

create table if not exists familee.repositories (
    id          uuid primary key default gen_random_uuid(),
    tree_id     uuid not null references familee.trees (id) on delete cascade,
    name        text not null,
    address     text,
    website     text,
    notes       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists repositories_tree_idx on familee.repositories (tree_id);

create table if not exists familee.sources (
    id             uuid primary key default gen_random_uuid(),
    tree_id        uuid not null references familee.trees (id) on delete cascade,
    repository_id  uuid references familee.repositories (id) on delete set null,
    title          text not null,
    author         text,
    publication    text,
    call_number    text,   -- archival reference: fond / inventory / file
    text_excerpt   text,
    url            text,
    gedcom_xref    text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),

    constraint sources_gedcom_xref_key unique (tree_id, gedcom_xref)
);

create index if not exists sources_tree_idx on familee.sources (tree_id);

alter table familee.media_links
    drop constraint if exists media_links_source_fk;
alter table familee.media_links
    add constraint media_links_source_fk foreign key (source_id)
        references familee.sources (id) on delete cascade;

-- A citation for one particular fact
create table if not exists familee.citations (
    id            uuid primary key default gen_random_uuid(),
    source_id     uuid not null references familee.sources (id) on delete cascade,

    person_id     uuid references familee.persons (id) on delete cascade,
    family_id     uuid references familee.families (id) on delete cascade,
    event_id      uuid references familee.events (id) on delete cascade,

    page          text,
    quality       smallint not null default 2,   -- GEDCOM QUAY: 0 questionable .. 3 reliable
    date_original text,
    text_excerpt  text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint citations_target_xor check (
        (person_id is not null)::int + (family_id is not null)::int +
        (event_id  is not null)::int = 1
    ),
    constraint citations_quality_range check (quality between 0 and 3)
);

create index if not exists citations_source_idx on familee.citations (source_id);
create index if not exists citations_person_idx on familee.citations (person_id);
create index if not exists citations_event_idx on familee.citations (event_id);


-- =====================================================================
--  NOTES
--
--  A note can be attached to a single entity or stand on its own as a record
--  of the researcher (a research log).
-- =====================================================================

create table if not exists familee.notes (
    id          uuid primary key default gen_random_uuid(),
    tree_id     uuid not null references familee.trees (id) on delete cascade,
    title       text,
    body        text not null,

    person_id   uuid references familee.persons (id) on delete cascade,
    family_id   uuid references familee.families (id) on delete cascade,
    event_id    uuid references familee.events (id) on delete cascade,
    place_id    uuid references familee.places (id) on delete cascade,
    source_id   uuid references familee.sources (id) on delete cascade,
    media_id    uuid references familee.media (id) on delete cascade,

    created_by  text references familee.users (id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint notes_body_not_empty check (btrim(body) <> ''),
    constraint notes_target_at_most_one check (
        (person_id is not null)::int + (family_id is not null)::int +
        (event_id  is not null)::int + (place_id  is not null)::int +
        (source_id is not null)::int + (media_id  is not null)::int <= 1
    )
);

create index if not exists notes_tree_idx on familee.notes (tree_id, created_at desc);
create index if not exists notes_person_idx on familee.notes (person_id);


-- =====================================================================
--  TREE MEMBERS
--  Created after persons: it references the person that the user is
--  themselves, which is needed to compute "how are they related to me".
-- =====================================================================

create table if not exists familee.tree_members (
    tree_id         uuid not null references familee.trees (id) on delete cascade,
    user_id         text not null references familee.users (id) on delete cascade,
    role            familee.member_role not null default 'viewer',
    self_person_id  uuid references familee.persons (id) on delete set null,
    invited_by      text references familee.users (id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    primary key (tree_id, user_id)
);

create index if not exists tree_members_user_idx on familee.tree_members (user_id);


-- =====================================================================
--  CHANGE LOG
--
--  Who changed what. changes stores a diff shaped as
--  {"field": {"from": ..., "to": ...}} - enough to roll a change back by hand.
-- =====================================================================

create table if not exists familee.audit_log (
    id           bigint generated always as identity primary key,
    tree_id      uuid references familee.trees (id) on delete cascade,
    user_id      text references familee.users (id) on delete set null,
    action       familee.audit_action not null,
    entity_type  text not null,
    entity_id    text,
    changes      jsonb,
    ip_address   text,
    created_at   timestamptz not null default now()
);

create index if not exists audit_log_tree_created_idx on familee.audit_log (tree_id, created_at desc);
create index if not exists audit_log_entity_idx on familee.audit_log (entity_type, entity_id);
create index if not exists audit_log_user_idx on familee.audit_log (user_id, created_at desc);


insert into familee.schema_migrations (version)
values ('0000_init')
on conflict (version) do nothing;

commit;
