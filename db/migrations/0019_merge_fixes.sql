-- Familee - the merges of persons, places and sources, corrected
--
-- An audit of the three merge functions (0015, 0017) found these faults, fixed here by replacing
-- the functions as a whole:
--
--   * merge_sources copied the GEDCOM identifier of the source that goes onto the survivor while the
--     row that goes still held it. sources_gedcom_xref_key is not deferrable, so a merge where only
--     the record that goes had an identifier failed. The record that goes is now read first and
--     removed before the survivor takes its fields. merge_persons does not copy persons.gedcom_xref
--     (the identifier lands in person_xrefs), and places have no unique column, so neither of them
--     had the same fault.
--   * merge_persons re-inserted the person_xrefs rows of the record that goes under the survivor;
--     each one met its own row in the unique index, was skipped, and then went with the cascade, so
--     a chain of merges forgot the earlier identifiers. The rows are now moved.
--   * merge_persons removed the key of the record that goes from relation_by_partner ("adopted by
--     this parent"); the key is now moved to the survivor, whose own value wins when both exist.
--   * merge_persons demoted the primary name of the record that goes before it compared the names,
--     and compared only equal is_primary, so a primary name identical to the survivor's stayed as a
--     second copy; and it compared four parts of a name only, so names that differed in the suffix,
--     the prefix, the language, the surname at birth or the notes were deleted. A name of the
--     record that goes is now compared with every part of the survivor's names, whichever is
--     primary, and is never deleted while it carries notes that the survivor's copy does not.
--   * merge_places handled a survivor that was a direct child of the place that goes, but not a
--     grandchild or deeper: re-parenting the children then closed a loop and the merge failed.
--   * none of the three locked the two records, so an edit or a second merge running at the same
--     time could work on a record that was half moved.
--
-- And the indexes that the merges and the cascades of a delete read and that were never made: the
-- notes, media links and citations found by their place, source, union, event or file.

begin;

-- =====================================================================
--  1. Merging two persons
-- =====================================================================

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

    -- 0. Both records are locked until the end of the transaction, in a fixed order so that two
    --    merges of the same pair wait for each other instead of deadlocking.
    perform 1
       from familee.persons
      where tree_id = p_tree and id in (p_keep, p_drop)
      order by id
        for update;

    if not exists (select 1 from familee.persons
                    where tree_id = p_tree and id = p_keep and deleted_at is null) then
        raise exception 'familee.merge_persons: merge_not_found';
    end if;

    if not exists (select 1 from familee.persons
                    where tree_id = p_tree and id = p_drop and deleted_at is null) then
        raise exception 'familee.merge_persons: merge_not_found';
    end if;

    -- 1. Names. A name of the record that goes is the same as one of the survivor's when every part
    --    of it is: the type, each part of the name and the language. Whether either one is primary
    --    does not matter. Empty strings and nulls are not folded together: a doubtful pair stays
    --    as two names, which is a click to clean up, rather than one deleted name.
    --
    -- 1a. The survivor's copy takes the notes of the duplicate when it has none of its own.
    update familee.person_names k
       set notes = d.notes,
           updated_at = now()
      from familee.person_names d
     where k.person_id = p_keep
       and d.person_id = p_drop
       and (k.type, k.surname, k.given, k.patronymic, k.prefix, k.suffix, k.nickname,
            k.surname_at_birth, k.locale)
           is not distinct from
           (d.type, d.surname, d.given, d.patronymic, d.prefix, d.suffix, d.nickname,
            d.surname_at_birth, d.locale)
       and nullif(btrim(k.notes), '') is null
       and nullif(btrim(d.notes), '') is not null;

    -- 1b. When the primary name of the record that goes is a duplicate and the survivor has no
    --     primary name at all, the survivor's copy becomes the primary one.
    update familee.person_names k
       set is_primary = true,
           updated_at = now()
     where k.id = (
               select c.id
                 from familee.person_names c
                 join familee.person_names d on d.person_id = p_drop and d.is_primary
                where c.person_id = p_keep
                  and (c.type, c.surname, c.given, c.patronymic, c.prefix, c.suffix, c.nickname,
                       c.surname_at_birth, c.locale)
                      is not distinct from
                      (d.type, d.surname, d.given, d.patronymic, d.prefix, d.suffix, d.nickname,
                       d.surname_at_birth, d.locale)
                order by c.created_at, c.id
                limit 1)
       and not exists (select 1 from familee.person_names p
                        where p.person_id = p_keep and p.is_primary);

    -- 1c. The duplicates go, unless they carry notes that the survivor's copy does not.
    delete from familee.person_names d
     where d.person_id = p_drop
       and exists (
           select 1
             from familee.person_names k
            where k.person_id = p_keep
              and (k.type, k.surname, k.given, k.patronymic, k.prefix, k.suffix, k.nickname,
                   k.surname_at_birth, k.locale)
                  is not distinct from
                  (d.type, d.surname, d.given, d.patronymic, d.prefix, d.suffix, d.nickname,
                   d.surname_at_birth, d.locale)
              and (nullif(btrim(d.notes), '') is null or k.notes is not distinct from d.notes));

    -- 1d. The primary name of the survivor stays primary; the other names follow it. The demotion
    --     comes first: the trigger of 0001 would otherwise demote the survivor's primary name when
    --     a primary name moves in.
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

    -- The relation a child has towards one parent is keyed by that parent's identifier: the key
    -- moves to the survivor. When the survivor already has a key of its own there, it wins.
    update familee.family_children fc
       set relation_by_partner = case
               when fc.relation_by_partner ? p_keep::text
               then fc.relation_by_partner - p_drop::text
               else (fc.relation_by_partner - p_drop::text)
                    || jsonb_build_object(p_keep::text, fc.relation_by_partner -> p_drop::text)
           end
     where fc.tree_id = p_tree
       and fc.relation_by_partner ? p_drop::text;

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

    -- 7. The identifiers of the files follow the survivor, so a repeated import finds him. The
    --    further identifiers of the record that goes (earlier merges into it) are moved: the unique
    --    index is per tree, so none of them can meet one of the survivor's. Its own identifier is
    --    added; one that some other record already carries stays where it is.
    update familee.person_xrefs
       set person_id = p_keep
     where tree_id = p_tree
       and person_id = p_drop;

    insert into familee.person_xrefs (tree_id, person_id, xref)
    select p_tree, p_keep, p.gedcom_xref
      from familee.persons p
     where p.tree_id = p_tree
       and p.id = p_drop
       and p.gedcom_xref is not null
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


-- =====================================================================
--  2. Merging two places
-- =====================================================================

create or replace function familee.merge_places(
    p_tree uuid,
    p_keep uuid,
    p_drop uuid
) returns jsonb
language plpgsql
as $$
declare
    v_events   int := 0;
    v_media    int := 0;
    v_notes    int := 0;
    v_links    int := 0;
    v_children int := 0;
    v_under    boolean := false;
begin
    if p_keep = p_drop then
        raise exception 'familee.merge_places: merge_self';
    end if;

    -- 0. Both records are locked until the end of the transaction, in a fixed order.
    perform 1
       from familee.places
      where tree_id = p_tree and id in (p_keep, p_drop)
      order by id
        for update;

    if not exists (select 1 from familee.places where tree_id = p_tree and id = p_keep) then
        raise exception 'familee.merge_places: merge_not_found';
    end if;

    if not exists (select 1 from familee.places where tree_id = p_tree and id = p_drop) then
        raise exception 'familee.merge_places: merge_not_found';
    end if;

    -- 1. The survivor cannot end up inside itself. When it sits anywhere under the place that goes
    --    - a child, a grandchild or deeper - it is first lifted to the parent of that place; the
    --    places between the two then become its children in step 2. The walk is bounded like the
    --    cycle check of 0001.
    with recursive up (id, parent_id, depth) as (
        select p.id, p.parent_id, 0
          from familee.places p
         where p.id = p_keep
        union all
        select p.id, p.parent_id, up.depth + 1
          from up
          join familee.places p on p.id = up.parent_id
         where up.depth < 64
    )
    select exists (select 1 from up where up.id = p_drop and up.depth > 0) into v_under;

    if v_under then
        update familee.places
           set parent_id = (select parent_id from familee.places where id = p_drop),
               updated_at = now()
         where id = p_keep;
    end if;

    -- 2. The children of the place that goes become children of the survivor. The survivor itself is
    --    left out - that case was settled above.
    update familee.places
       set parent_id = p_keep,
           updated_at = now()
     where parent_id = p_drop
       and id <> p_keep;
    get diagnostics v_children = row_count;

    -- 3. Everything that points at the place follows it. The trigger of the events checks that the
    --    place is of the same tree, which the two guards above have already established.
    update familee.events
       set place_id = p_keep,
           updated_at = now()
     where place_id = p_drop;
    get diagnostics v_events = row_count;

    update familee.media
       set place_id = p_keep
     where place_id = p_drop;
    get diagnostics v_media = row_count;

    update familee.notes
       set place_id = p_keep,
           updated_at = now()
     where place_id = p_drop;
    get diagnostics v_notes = row_count;

    -- 4. A link that the survivor already has is not made twice; the rest follow.
    delete from familee.media_links ml
     where ml.place_id = p_drop
       and exists (select 1 from familee.media_links k
                    where k.media_id = ml.media_id and k.place_id = p_keep);

    update familee.media_links
       set place_id = p_keep
     where place_id = p_drop;
    get diagnostics v_links = row_count;

    -- 5. What the survivor does not know, it learns from the record that goes. Places have no unique
    --    column besides the key, so the record that goes can be read while it is still there.
    update familee.places k
       set kind = case when k.kind = 'other' then d.kind else k.kind end,
           latitude = coalesce(k.latitude, d.latitude),
           longitude = coalesce(k.longitude, d.longitude),
           former_names = case
               when cardinality(k.former_names) = 0 then d.former_names
               else k.former_names
           end,
           notes = case
               when k.notes is null or btrim(k.notes) = '' then d.notes
               else k.notes
           end,
           updated_at = now()
      from familee.places d
     where k.id = p_keep
       and d.id = p_drop;

    delete from familee.places where tree_id = p_tree and id = p_drop;

    return jsonb_build_object(
        'events', v_events,
        'media', v_media,
        'notes', v_notes,
        'links', v_links,
        'children', v_children
    );
end;
$$;

comment on function familee.merge_places(uuid, uuid, uuid) is
    'Moves everything that points at one place onto another and removes the empty record';


-- =====================================================================
--  3. Merging two sources
-- =====================================================================

create or replace function familee.merge_sources(
    p_tree uuid,
    p_keep uuid,
    p_drop uuid
) returns jsonb
language plpgsql
as $$
declare
    v_citations int := 0;
    v_notes     int := 0;
    v_links     int := 0;
    v_drop      familee.sources%rowtype;
begin
    if p_keep = p_drop then
        raise exception 'familee.merge_sources: merge_self';
    end if;

    -- 0. Both records are locked until the end of the transaction, in a fixed order.
    perform 1
       from familee.sources
      where tree_id = p_tree and id in (p_keep, p_drop)
      order by id
        for update;

    if not exists (select 1 from familee.sources where tree_id = p_tree and id = p_keep) then
        raise exception 'familee.merge_sources: merge_not_found';
    end if;

    -- The record that goes is read whole: it is removed before the survivor takes its fields.
    select * into v_drop from familee.sources where tree_id = p_tree and id = p_drop;
    if not found then
        raise exception 'familee.merge_sources: merge_not_found';
    end if;

    -- 1. The citations follow the document that stays. The single-tree rule of the citations is not
    --    disturbed: both records are of this tree, and only the source changes.
    update familee.citations
       set source_id = p_keep,
           updated_at = now()
     where source_id = p_drop;
    get diagnostics v_citations = row_count;

    update familee.notes
       set source_id = p_keep,
           updated_at = now()
     where source_id = p_drop;
    get diagnostics v_notes = row_count;

    -- 2. A link that the survivor already has is not made twice; the rest follow.
    delete from familee.media_links ml
     where ml.source_id = p_drop
       and exists (select 1 from familee.media_links k
                    where k.media_id = ml.media_id and k.source_id = p_keep);

    update familee.media_links
       set source_id = p_keep
     where source_id = p_drop;
    get diagnostics v_links = row_count;

    -- 3. The empty record goes first: sources_gedcom_xref_key is not deferrable, so the survivor
    --    can take the identifier in the file only once the record that goes no longer holds it.
    --    Everything that pointed at it has been moved above, so the cascade removes nothing.
    delete from familee.sources where tree_id = p_tree and id = p_drop;

    -- 4. What the survivor does not know, it learns from the record that went; a field both know
    --    keeps the answer of the survivor. Its identifier in the file follows too, unless the
    --    survivor already has one of its own.
    update familee.sources k
       set author = coalesce(k.author, v_drop.author),
           publication = coalesce(k.publication, v_drop.publication),
           call_number = coalesce(k.call_number, v_drop.call_number),
           text_excerpt = coalesce(k.text_excerpt, v_drop.text_excerpt),
           url = coalesce(k.url, v_drop.url),
           repository_id = coalesce(k.repository_id, v_drop.repository_id),
           gedcom_xref = coalesce(k.gedcom_xref, v_drop.gedcom_xref),
           updated_at = now()
     where k.tree_id = p_tree
       and k.id = p_keep;

    return jsonb_build_object(
        'citations', v_citations,
        'notes', v_notes,
        'links', v_links
    );
end;
$$;

comment on function familee.merge_sources(uuid, uuid, uuid) is
    'Moves everything that points at one source onto another and removes the empty record';


-- =====================================================================
--  4. The indexes the merges and the cascades read
--
--  A merge re-points every row that names the record that goes, and deleting a place, a source, a
--  union, an event or a file makes Postgres find the rows that cascade with it. Without an index on
--  the referencing column each of those reads the whole table. The columns are mostly empty (a note
--  has one target at most), so the indexes are partial; a lookup by value implies "is not null" and
--  uses them.
-- =====================================================================

create index if not exists notes_family_idx
    on familee.notes (family_id) where family_id is not null;
create index if not exists notes_event_idx
    on familee.notes (event_id) where event_id is not null;
create index if not exists notes_place_idx
    on familee.notes (place_id) where place_id is not null;
create index if not exists notes_source_idx
    on familee.notes (source_id) where source_id is not null;
create index if not exists notes_media_idx
    on familee.notes (media_id) where media_id is not null;

create index if not exists media_links_place_idx
    on familee.media_links (place_id) where place_id is not null;
create index if not exists media_links_source_idx
    on familee.media_links (source_id) where source_id is not null;

create index if not exists citations_family_idx
    on familee.citations (family_id) where family_id is not null;

insert into familee.schema_migrations (version)
values ('0019_merge_fixes')
on conflict do nothing;

commit;
