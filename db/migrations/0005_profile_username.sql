-- Familee - migration 0005: the user name for sign-in and the profile
--
-- The better-auth username plugin keeps the login name in users.username (unique,
-- lower case) and the name as the person typed it in users.display_username. The
-- person can sign in with either the e-mail or the username.
--
-- Idempotent: every statement can run again without harm.

begin;

alter table familee.users add column if not exists username text;
alter table familee.users add column if not exists display_username text;

create unique index if not exists users_username_key on familee.users (username);

insert into familee.schema_migrations (version)
values ('0005_profile_username')
on conflict do nothing;

commit;
