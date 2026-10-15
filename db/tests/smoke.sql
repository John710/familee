-- Familee - smoke tests of the database
--
-- Run after the migrations and the demo seed, through the migrate service:
--   docker compose --profile tools run --rm migrate test
--
-- Everything happens inside one transaction that is rolled back at the end,
-- so the demo tree is left exactly as it was. Any failed check raises an
-- exception, which makes psql (ON_ERROR_STOP) exit with a non-zero code.

\set ON_ERROR_STOP on

begin;

do $$
declare
    v_tree      uuid;
    v_persons   int;
    v_person    uuid;
    v_ancestor  uuid;
    v_family    uuid;
    v_message   text := '';
    v_kinship_a int;
    v_kinship_b int;
begin
    -- 1. The demo tree is present and complete.
    select id into v_tree from familee.trees where slug = 'demo';
    if v_tree is null then
        raise exception 'smoke: the demo tree is missing - run the seed first';
    end if;

    select count(*) into v_persons from familee.persons where tree_id = v_tree;
    if v_persons <> 25 then
        raise exception 'smoke: expected 25 persons in the demo tree, got %', v_persons;
    end if;

    -- 2. The ancestor walk reaches a grandparent (depth 2).
    select p.id, a.person_id into v_person, v_ancestor
      from familee.persons p
      cross join lateral familee.ancestors(p.id) a
     where p.tree_id = v_tree
       and a.depth = 2
     limit 1;
    if v_ancestor is null then
        raise exception 'smoke: no ancestor at depth 2 found in the demo tree';
    end if;

    -- 3. kinship() answers for a pair of relatives with two numbers.
    select depth_a, depth_b into v_kinship_a, v_kinship_b
      from familee.kinship(v_person, v_ancestor)
     limit 1;
    if v_kinship_a is null or v_kinship_b is null then
        raise exception 'smoke: kinship() returned NULL for a known pair of relatives';
    end if;

    -- 4. The guard against kinship cycles blocks a grandparent becoming a child
    --    of the grandchild's own union. The error must be the cycle error, not
    --    some unrelated failure, so its text is checked as well.
    begin
        insert into familee.families (id, tree_id, type, status)
        values (gen_random_uuid(), v_tree, 'marriage', 'unknown')
        returning id into v_family;

        insert into familee.family_partners (tree_id, family_id, person_id, role, sort_order)
        values (v_tree, v_family, v_person, 'unknown', 0);

        insert into familee.family_children (tree_id, family_id, person_id, relation)
        values (v_tree, v_family, v_ancestor, 'biological');

        raise exception 'smoke: the kinship cycle was accepted';
    exception
        when others then
            v_message := sqlerrm;
    end;

    if v_message not like '%would become their own ancestor%' then
        raise exception 'smoke: the cycle guard failed with an unexpected message: %', v_message;
    end if;

    -- 5. The living rule: no age cutoff, a person is deceased only with a dated death.
    if familee.derive_is_living(null, false) is not true
       or familee.derive_is_living(null, true) is not false
       or familee.derive_is_living(true, true) is not true then
        raise exception 'smoke: derive_is_living does not follow the death-date rule';
    end if;

    -- 6. An invitation can never grant the owner role.
    v_message := '';
    begin
        insert into familee.invitations (tree_id, email, role, token_hash, expires_at)
        values (v_tree, 'owner-test@example.com', 'owner', 'smoke-owner-hash', now() + interval '1 day');
        raise exception 'smoke: an invitation granted the owner role';
    exception
        when others then
            v_message := sqlerrm;
    end;

    if v_message not like '%invitations_role_not_owner%' then
        raise exception 'smoke: owner invitation failed with an unexpected message: %', v_message;
    end if;

    -- 7. A person can be chosen as self by one member of a tree only
    --    (tree_members_self_person_key, migration 0010).
    insert into familee.users (id, email, name)
    values ('smoke-self-a', 'smoke-self-a@example.com', 'Smoke A');

    insert into familee.tree_members (tree_id, user_id, role, self_person_id)
    values (v_tree, 'smoke-self-a', 'viewer', v_person);

    v_message := '';
    begin
        insert into familee.users (id, email, name)
        values ('smoke-self-b', 'smoke-self-b@example.com', 'Smoke B');

        insert into familee.tree_members (tree_id, user_id, role, self_person_id)
        values (v_tree, 'smoke-self-b', 'viewer', v_person);

        raise exception 'smoke: two members could choose the same person as themselves';
    exception
        when others then
            v_message := sqlerrm;
    end;

    if v_message not like '%tree_members_self_person_key%' then
        raise exception 'smoke: the self-person uniqueness failed with an unexpected message: %',
            v_message;
    end if;

    raise notice 'smoke: all checks passed (persons=%, kinship=%/%)',
        v_persons, v_kinship_a, v_kinship_b;
end;
$$;

rollback;
