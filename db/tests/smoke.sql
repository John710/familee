-- Familee - smoke tests of the database
--
-- Run after the migrations and the demo seed, through the tools service:
--   docker compose --profile tools run --rm tools test
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
    v_merge_keep uuid;
    v_merge_drop uuid;
    v_place_keep uuid;
    v_place_drop uuid;
    v_place_child uuid;
    v_source_keep uuid;
    v_source_drop uuid;
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

    -- 8. The trash: a person with deleted_at is gone from the cards and from the
    --    parent-child edges, and comes back the moment the mark is cleared
    --    (migration 0012). The place of a person in the trash is not forgotten.
    update familee.persons set deleted_at = now(), deleted_by = null where id = v_person;

    if exists (select 1 from familee.person_cards where person_id = v_person) then
        raise exception 'smoke: a person in the trash still has a card';
    end if;

    if exists (select 1 from familee.parent_child
                where parent_id = v_person or child_id = v_person) then
        raise exception 'smoke: a person in the trash is still a parent or a child';
    end if;

    update familee.persons set deleted_at = null where id = v_person;

    if not exists (select 1 from familee.person_cards where person_id = v_person) then
        raise exception 'smoke: a person did not come back from the trash';
    end if;

    if not exists (select 1 from familee.parent_child
                    where parent_id = v_person or child_id = v_person) then
        raise exception 'smoke: the parent-child edges of a person did not come back';
    end if;

    -- 9. Merging two records of one person: the record that goes leaves nothing behind but its
    --    names, its events and its file identifiers follow the survivor (migration 0013).
    v_merge_keep := v_person;

    insert into familee.persons (tree_id, sex, gedcom_xref)
    values (v_tree, 'male', '@SMOKE-MERGE@')
    returning id into v_merge_drop;

    insert into familee.person_names (person_id, type, is_primary, given, surname)
    values (v_merge_drop, 'birth', true, 'Smoke', 'Duplicate');

    insert into familee.events (tree_id, person_id, type_code, is_primary, date_start, date_precision)
    values (v_tree, v_merge_drop, 'birth', true, '1900-01-01', 'day');

    perform familee.merge_persons(v_tree, v_merge_keep, v_merge_drop);

    if exists (select 1 from familee.persons where id = v_merge_drop) then
        raise exception 'smoke: the merged record is still in the tree';
    end if;

    if not exists (select 1 from familee.person_names
                    where person_id = v_merge_keep and surname = 'Duplicate') then
        raise exception 'smoke: the name of the merged record did not follow';
    end if;

    if not exists (select 1 from familee.events
                    where person_id = v_merge_keep and date_start = '1900-01-01') then
        raise exception 'smoke: the event of the merged record did not follow';
    end if;

    if not exists (select 1 from familee.person_xrefs
                    where person_id = v_merge_keep and xref = '@SMOKE-MERGE@') then
        raise exception 'smoke: the file identifier of the merged record did not follow';
    end if;

    begin
        perform familee.merge_persons(v_tree, v_merge_keep, v_merge_keep);
        raise exception 'smoke: a person was merged with themselves';
    exception
        when others then
            if sqlerrm not like '%merge_self%' then
                raise;
            end if;
    end;

    -- 10. Merging two places: the events follow the survivor, its children are re-parented and it
    --     takes over what it did not know (the kind of the record that goes) - migration 0015.
    insert into familee.places (tree_id, name, kind)
    values (v_tree, 'Smoke Place A', 'other')
    returning id into v_place_keep;

    insert into familee.places (tree_id, name, kind)
    values (v_tree, 'Smoke Place A', 'city')
    returning id into v_place_drop;

    insert into familee.places (tree_id, name, parent_id)
    values (v_tree, 'Smoke Place Child', v_place_drop)
    returning id into v_place_child;

    insert into familee.events (tree_id, person_id, type_code, place_id)
    values (v_tree, v_merge_keep, 'residence', v_place_drop);

    perform familee.merge_places(v_tree, v_place_keep, v_place_drop);

    if exists (select 1 from familee.places where id = v_place_drop) then
        raise exception 'smoke: the merged place is still in the tree';
    end if;

    if not exists (select 1 from familee.events
                    where person_id = v_merge_keep and place_id = v_place_keep) then
        raise exception 'smoke: the event of the merged place did not follow';
    end if;

    if not exists (select 1 from familee.places
                    where id = v_place_child and parent_id = v_place_keep) then
        raise exception 'smoke: the child of the merged place was not re-parented';
    end if;

    if (select kind from familee.places where id = v_place_keep) <> 'city' then
        raise exception 'smoke: the survivor did not take the kind of the merged place';
    end if;

    -- 11. Merging two sources: the citations follow, the survivor takes the fields it did not have
    --     and keeps its own identifier in the file - migration 0015.
    insert into familee.sources (tree_id, title, gedcom_xref)
    values (v_tree, 'Smoke Source', '@SMOKE-SRC-KEEP@')
    returning id into v_source_keep;

    insert into familee.sources (tree_id, title, author, gedcom_xref)
    values (v_tree, 'Smoke Source', 'Smoke Author', '@SMOKE-SRC-DROP@')
    returning id into v_source_drop;

    insert into familee.citations (source_id, person_id) values (v_source_drop, v_merge_keep);

    perform familee.merge_sources(v_tree, v_source_keep, v_source_drop);

    if exists (select 1 from familee.sources where id = v_source_drop) then
        raise exception 'smoke: the merged source is still in the tree';
    end if;

    if not exists (select 1 from familee.citations
                    where source_id = v_source_keep and person_id = v_merge_keep) then
        raise exception 'smoke: the citation of the merged source did not follow';
    end if;

    if (select author from familee.sources where id = v_source_keep) <> 'Smoke Author' then
        raise exception 'smoke: the survivor did not take the author of the merged source';
    end if;

    if (select gedcom_xref from familee.sources where id = v_source_keep) <> '@SMOKE-SRC-KEEP@' then
        raise exception 'smoke: the survivor lost its own identifier in the file';
    end if;

    raise notice 'smoke: all checks passed (persons=%, kinship=%/%)',
        v_persons, v_kinship_a, v_kinship_b;
end;
$$;

rollback;
