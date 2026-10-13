-- Familee - migration 0004: the member roles
--
-- The role "contributor" is removed. The role "editor" is shown to people as
-- "Соавтор" / "Co-author" from now on. Existing contributors become editors: the
-- two roles were the same kind of person, and the owner's decision is that they
-- write to the archive.
--
-- PostgreSQL cannot drop a value from an enum, so the type is rebuilt. The block
-- runs only while the old value still exists, so replaying the migrations is safe.
--
-- Idempotent: every statement can run again without harm.

begin;

do $$
begin
    if exists (
        select 1
          from pg_enum e
          join pg_type t on t.oid = e.enumtypid
          join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = 'familee'
           and t.typname = 'member_role'
           and e.enumlabel = 'contributor'
    ) then
        -- Move the rows to the surviving role first.
        update familee.tree_members set role = 'editor' where role::text = 'contributor';
        update familee.invitations set role = 'editor' where role::text = 'contributor';

        -- The default of the column refers to the type, so it is removed first.
        alter table familee.tree_members alter column role drop default;
        alter table familee.invitations alter column role drop default;

        -- The check "role <> 'owner'" is bound to the old type: it is set aside and
        -- restored below, on the new type.
        alter table familee.invitations drop constraint if exists invitations_role_not_owner;

        alter type familee.member_role rename to member_role_old;
        create type familee.member_role as enum ('owner', 'admin', 'editor', 'viewer');

        alter table familee.tree_members
            alter column role type familee.member_role using role::text::familee.member_role,
            alter column role set default 'viewer';
        alter table familee.invitations
            alter column role type familee.member_role using role::text::familee.member_role,
            alter column role set default 'viewer';
        alter table familee.invitations
            add constraint invitations_role_not_owner check (role <> 'owner');

        drop type familee.member_role_old;
    end if;
end $$;

insert into familee.schema_migrations (version)
values ('0004_member_roles')
on conflict do nothing;

commit;
