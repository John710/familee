-- Familee - migration 0003: invitations and the living rule
--
-- 1. Invitations. Public sign-up is closed: an account appears only through an
--    invitation sent by an owner or an admin of a tree. The token itself is never
--    stored, only its SHA-256 hash, so a leaked table does not open any invitation.
--
-- 2. Living people. There is no age cutoff any more (the owner's decision): a person
--    is deceased when a death event with a date exists, and living otherwise. The
--    tree-level settings living_cutoff_years and hide_living go away, because members
--    see the details of living people. The function and the view that use them were
--    rewritten in 0001_functions.sql, which is replayed before this file.
--
-- Idempotent: every statement can run again without harm.

begin;

-- =====================================================================
--  INVITATIONS
-- =====================================================================

create table if not exists familee.invitations (
    id           uuid primary key default gen_random_uuid(),
    tree_id      uuid not null references familee.trees (id) on delete cascade,

    -- The address the invitation was sent to; only that account can accept it.
    email        text not null,

    -- The rights the new member receives. The owner role is never given by invitation.
    role         familee.member_role not null default 'viewer',

    -- SHA-256 hex of the token from the link. The token is shown once, at creation.
    token_hash   text not null,

    invited_by   text references familee.users (id) on delete set null,
    expires_at   timestamptz not null,
    accepted_at  timestamptz,
    accepted_by  text references familee.users (id) on delete set null,
    revoked_at   timestamptz,
    created_at   timestamptz not null default now(),

    constraint invitations_token_hash_key unique (token_hash),
    constraint invitations_email_lowercase check (email = lower(email)),
    constraint invitations_role_not_owner check (role <> 'owner'),
    constraint invitations_expires_after_created check (expires_at > created_at)
);

create index if not exists invitations_tree_idx on familee.invitations (tree_id);
create index if not exists invitations_email_idx on familee.invitations (email);

-- =====================================================================
--  LIVING RULE: the cutoff settings are removed
-- =====================================================================

alter table familee.trees drop constraint if exists trees_cutoff_sane;
alter table familee.trees drop column if exists living_cutoff_years;
alter table familee.trees drop column if exists hide_living;

-- The function with the old signature (boolean, date, boolean, int) is replaced
-- by derive_is_living(boolean, boolean) in 0001_functions.sql.
drop function if exists familee.derive_is_living(boolean, date, boolean, int);

insert into familee.schema_migrations (version)
values ('0003_invitations_and_living')
on conflict do nothing;

commit;
