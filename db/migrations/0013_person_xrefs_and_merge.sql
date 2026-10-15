-- Familee - merging two persons, and the identifiers of the files that point at one
--
-- A tree collects people from several files and hands: the same ancestor arrives twice with two
-- spellings, and one of the two records has to go. familee.merge_persons() moves everything that
-- belongs to the person being merged away onto the survivor - names, events, citations, notes,
-- photographs and the unions, taking the unique indexes into account on the way - and removes the
-- empty record. It is one transaction, so a move that would close a pedigree cycle rolls the whole
-- merge back and nothing changes.
--
-- familee.person_xrefs keeps the identifiers of the files that point at a person: the identifier of
-- the record he came from lives in persons.gedcom_xref, and every further one - the identifier of a
-- duplicate that was merged into him - lands here. A repeated import finds him through either of
-- them instead of creating the duplicate again.

begin;

create table if not exists familee.person_xrefs (
    id uuid primary key default gen_random_uuid(),
    tree_id uuid not null references familee.trees (id) on delete cascade,
    person_id uuid not null,
    xref text not null,
    created_at timestamptz not null default now(),
    foreign key (tree_id, person_id) references familee.persons (tree_id, id) on delete cascade
);

comment on table familee.person_xrefs is
    'The further GEDCOM identifiers of a person: what a merged duplicate used to be called';

create unique index if not exists person_xrefs_tree_xref_key
    on familee.person_xrefs (tree_id, xref);

create index if not exists person_xrefs_person_idx
    on familee.person_xrefs (person_id);

create or replace function familee.merge_persons(
    p_tree uuid,
    p_keep uuid,
    p_drop uuid
) returns jsonb
language plpgsql
as $$
declare
    v_names     int := 0;
    v_events    int := 0;
    v_citations int := 0;
    v_notes     int := 0;
    v_photos    int := 0;
    v_unions    int := 0;
    v_members   int := 0;
begin
    if p_keep = p_drop then
        raise exception 'familee.merge_persons: merge_self';
    end if;

    if not exists (select 1 from familee.persons
                    where tree_id = p_tree and id = p_keep and deleted_at is null) then
        raise exception 'familee.merge_persons: merge_not_found';
    end if;

    if not exists (select 1 from familee.persons
                    where tree_id = p_tree and id = p_drop and deleted_at is null) then
        raise exception 'familee.merge_persons: merge_not_found';
    end if;

    -- 1. Names. The primary name of the survivor stays primary; the others follow it.
    update familee.person_names n
       set is_primary = false,
           updated_at = now()
     where n.person_id = p_drop
       and n.is_primary
       and exists (select 1 from familee.person_names k
                    where k.person_id = p_keep and k.is_primary);

    update familee.person_names
       set person_id = p_keep,
           updated_at = now()
     where person_id = p_drop;
    get diagnostics v_names = row_count;

    -- A name the survivor already carries, word for word, is not kept twice.
    delete from familee.person_names a
     using familee.person_names b
     where a.person_id = p_keep
       and b.person_id = p_keep
       and a.id > b.id
       and a.is_primary = b.is_primary
       and a.type = b.type
       and coalesce(a.surname, '') = coalesce(b.surname, '')
       and coalesce(a.given, '') = coalesce(b.given, '')
       and coalesce(a.patronymic, '') = coalesce(b.patronymic, '')
       and coalesce(a.nickname, '') = coalesce(b.nickname, '');

    -- 2. Events. A type has one primary event: the survivor's wins, the other one stays a record.
    update familee.events e
       set person_id = p_keep,
           is_primary = case
               when e.is_primary and exists (
                   select 1 from familee.events k
                    where k.person_id = p_keep
                      and k.type_code = e.type_code
                      and k.is_primary)
               then false
               else e.is_primary
           end,
           updated_at = now()
     where e.person_id = p_drop;
    get diagnostics v_events = row_count;

    -- 3. Citations and notes follow the person.
    update familee.citations set person_id = p_keep where person_id = p_drop;
    get diagnostics v_citations = row_count;

    update familee.notes set person_id = p_keep where person_id = p_drop;
    get diagnostics v_notes = row_count;

    -- 4. Photographs. A file already linked to the survivor is not linked twice, and one portrait
    --    is the main one.
    delete from familee.media_links ml
     where ml.person_id = p_drop
       and exists (select 1 from familee.media_links k
                    where k.person_id = p_keep and k.media_id = ml.media_id);

    update familee.media_links ml
       set person_id = p_keep,
           is_primary = case
               when ml.is_primary and exists (
                   select 1 from familee.media_links k
                    where k.person_id = p_keep and k.is_primary)
               then false
               else ml.is_primary
           end
     where ml.person_id = p_drop;
    get diagnostics v_photos = row_count;

    -- 5. Unions. The triggers of the migrations refuse a move that closes a pedigree cycle or makes
    --    somebody a partner and a child of the same union, and the whole merge rolls back with it.
    delete from familee.family_partners fp
     where fp.person_id = p_drop
       and exists (select 1 from familee.family_partners k
                    where k.family_id = fp.family_id and k.person_id = p_keep);

    delete from familee.family_children fc
     where fc.person_id = p_drop
       and exists (select 1 from familee.family_children k
                    where k.family_id = fc.family_id and k.person_id = p_keep);

    update familee.family_partners set person_id = p_keep where person_id = p_drop;
    get diagnostics v_unions = row_count;

    update familee.family_children set person_id = p_keep where person_id = p_drop;

    -- The relation a child has towards one parent is keyed by that parent's identifier.
    update familee.family_children
       set relation_by_partner = relation_by_partner - p_drop::text
     where relation_by_partner ? p_drop::text;

    -- 6. A member who had chosen the person who goes now has the survivor - or nobody, when
    --    somebody else in the same tree had already chosen the survivor.
    update familee.tree_members tm
       set self_person_id = case
               when exists (select 1 from familee.tree_members o
                             where o.tree_id = tm.tree_id and o.self_person_id = p_keep)
               then null
               else p_keep
           end,
           self_chosen_at = case
               when exists (select 1 from familee.tree_members o
                             where o.tree_id = tm.tree_id and o.self_person_id = p_keep)
               then null
               else tm.self_chosen_at
           end
     where tm.self_person_id = p_drop;
    get diagnostics v_members = row_count;

    -- 7. The identifiers of the files follow the survivor, so a repeated import finds him.
    insert into familee.person_xrefs (tree_id, person_id, xref)
    select p_tree, p_keep, x.xref
      from (select gedcom_xref as xref
              from familee.persons
             where id = p_drop and gedcom_xref is not null
            union
            select xref from familee.person_xrefs where person_id = p_drop) x
    on conflict (tree_id, xref) do nothing;

    -- 8. The empty record goes; everything else has been moved.
    delete from familee.persons where tree_id = p_tree and id = p_drop;

    return jsonb_build_object(
        'names', v_names,
        'events', v_events,
        'citations', v_citations,
        'notes', v_notes,
        'photos', v_photos,
        'unions', v_unions,
        'members', v_members
    );
end;
$$;

comment on function familee.merge_persons(uuid, uuid, uuid) is
    'Moves everything of one person onto another and removes the empty record';

insert into familee.schema_migrations (version)
values ('0013_person_xrefs_and_merge')
on conflict do nothing;

commit;
