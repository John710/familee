-- Familee - migration 0006: the logo of a tree
--
-- The logo is kept in the database as a data URL of a small WebP image (256 x 256),
-- made by the server from the file the owner or an administrator uploads. Empty
-- means "no logo": the default tree icon is shown.
--
-- Idempotent: every statement can run again without harm.

begin;

alter table familee.trees add column if not exists logo_data text;

insert into familee.schema_migrations (version)
values ('0006_tree_logo')
on conflict do nothing;

commit;
