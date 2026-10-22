-- Familee - a merge keeps the tags of the people in the photographs
--
-- merge_persons() was written before media_people existed (migration 0014): it moved the links of a
-- photograph to a person, but not the tags of the people seen in it. The tags of the record being
-- merged away were then removed by the cascade when the empty record went, silently.
--
-- The same function, with two steps added:
--   * the tags follow the survivor, and a photograph is not tagged with the same person twice;
--   * the fields that live on the persons row itself (sex, is_living, privacy, headline, notes) are
--     no longer thrown away either: the survivor keeps its own values and fills the empty ones from
--     the record that goes, while privacy takes the stricter of the two.
--
-- The rest is unchanged from 0013 and is repeated here because the function is replaced as a whole.

begin;

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
    v_tags      int := 0;
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

    -- 3a. The tags of the people in the photographs follow the survivor. A file tagged with both
    --     records keeps one tag, not two.
    delete from familee.media_people mp
     where mp.person_id = p_drop
       and exists (select 1 from familee.media_people k
                    where k.media_id = mp.media_id and k.person_id = p_keep);

    update familee.media_people set person_id = p_keep where person_id = p_drop;
    get diagnostics v_tags = row_count;

    -- 3b. The fields of the record itself. The survivor keeps what it has; an empty value is filled
    --     from the record that goes; privacy takes the stricter of the two, so a merge never
    --     publishes what one of the records hid.
    update familee.persons k
       set sex = case
               when k.sex = 'unknown' and d.sex <> 'unknown' then d.sex
               else k.sex
           end,
           is_living = coalesce(k.is_living, d.is_living),
           privacy = case
               when k.privacy = 'private' or d.privacy = 'private' then 'private'
               when k.privacy = 'members' or d.privacy = 'members' then 'members'
               else k.privacy
           end,
           headline = coalesce(k.headline, d.headline),
           notes = coalesce(k.notes, d.notes),
           updated_at = now()
      from familee.persons d
     where k.tree_id = p_tree and k.id = p_keep
       and d.tree_id = p_tree and d.id = p_drop;

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
        'tags', v_tags,
        'photos', v_photos,
        'unions', v_unions,
        'members', v_members
    );
end;
$$;

comment on function familee.merge_persons(uuid, uuid, uuid) is
    'Moves everything of one person onto another and removes the empty record';

insert into familee.schema_migrations (version)
values ('0017_merge_keeps_tags_and_fields')
on conflict do nothing;

commit;
