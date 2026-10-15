-- Familee - a secret address for the calendar of a tree
--
-- A calendar app on a phone has no session, so the feed is reached by a token that belongs to the
-- tree. The address is /api/calendar/<token>; replacing the value retires the old address.

begin;

alter table familee.trees
    add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists trees_calendar_token_key
    on familee.trees (calendar_token);

insert into familee.schema_migrations (version)
values ('0011_tree_calendar_token')
on conflict do nothing;

commit;
