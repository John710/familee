-- Familee - migration 0008: when a member chose the person who is themselves
--
-- The profile shows the portrait of the person chosen most recently, across all trees, so
-- the choice needs a time. Choices made before this migration take the last update of the
-- membership as their time, which is the closest the database knows.
--
-- Idempotent: the column is added only when it is missing, and the back-fill touches only
-- rows that have a choice and no time yet.

begin;

alter table familee.tree_members
    add column if not exists self_chosen_at timestamptz;

update familee.tree_members
   set self_chosen_at = updated_at
 where self_person_id is not null
   and self_chosen_at is null;

insert into familee.schema_migrations (version)
values ('0008_self_chosen_at')
on conflict do nothing;

commit;
