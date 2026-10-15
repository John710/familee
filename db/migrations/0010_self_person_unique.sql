-- Familee - one tree member per self person
--
-- Refuse ambiguous existing data rather than silently changing anyone's identity.
-- Resolve duplicate choices in the profile before retrying this migration.

begin;

create unique index if not exists tree_members_self_person_key
    on familee.tree_members (tree_id, self_person_id);

insert into familee.schema_migrations (version)
values ('0010_self_person_unique')
on conflict do nothing;

commit;
