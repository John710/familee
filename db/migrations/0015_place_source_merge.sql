-- Familee - merging two places, and merging two sources
--
-- The same village arrives twice in a tree - once from a file that spelled it "Tula", once from a
-- hand that wrote "Tula, Russia" for every event - and a document is entered twice under two
-- spellings of its title. A person has had familee.merge_persons() since migration 0013; a place and
-- a source had nothing, and the only way to clean a tree was to re-point every event by hand.
--
-- familee.merge_places() moves what points at the place that goes - the events, the media, the links
-- and the notes - re-parents its children onto the survivor, and takes over what the survivor does
-- not know yet (its coordinates, its former names, its notes). A link or a child that would be a
-- second copy of one the survivor already has is dropped rather than doubled; the hierarchy check of
-- 0001 refuses a merge that would close a loop in the tree of places, and the whole merge rolls back.
--
-- familee.merge_sources() moves the citations, the media links and the notes, and fills the blanks
-- of the survivor. Its GEDCOM identifier follows the survivor, so a repeated import finds the
-- document it already has. Both functions are one transaction; both answer with the counts they
-- moved, which the caller puts in the history of the tree.

begin;

create or replace function familee.merge_places(
    p_tree uuid,
    p_keep uuid,
    p_drop uuid
) returns jsonb
language plpgsql
as $$
declare
    v_events  int := 0;
    v_media   int := 0;
    v_notes   int := 0;
    v_links   int := 0;
    v_children int := 0;
begin
    if p_keep = p_drop then
        raise exception 'familee.merge_places: merge_self';
    end if;

    if not exists (select 1 from familee.places where tree_id = p_tree and id = p_keep) then
        raise exception 'familee.merge_places: merge_not_found';
    end if;

    if not exists (select 1 from familee.places where tree_id = p_tree and id = p_drop) then
        raise exception 'familee.merge_places: merge_not_found';
    end if;

    -- 1. The survivor cannot become its own parent: when its parent is the place that goes, it
    --    inherits the parent of that one instead.
    update familee.places
       set parent_id = (select parent_id from familee.places where id = p_drop),
           updated_at = now()
     where id = p_keep
       and parent_id = p_drop;

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

    -- 5. What the survivor does not know, it learns from the record that goes.
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
begin
    if p_keep = p_drop then
        raise exception 'familee.merge_sources: merge_self';
    end if;

    if not exists (select 1 from familee.sources where tree_id = p_tree and id = p_keep) then
        raise exception 'familee.merge_sources: merge_not_found';
    end if;

    if not exists (select 1 from familee.sources where tree_id = p_tree and id = p_drop) then
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

    -- 3. What the survivor does not know, it learns from the record that goes; a field both know
    --    keeps the answer of the survivor. Its identifier in the file follows too, unless the
    --    survivor already has one of its own.
    update familee.sources k
       set author = coalesce(k.author, d.author),
           publication = coalesce(k.publication, d.publication),
           call_number = coalesce(k.call_number, d.call_number),
           text_excerpt = coalesce(k.text_excerpt, d.text_excerpt),
           url = coalesce(k.url, d.url),
           repository_id = coalesce(k.repository_id, d.repository_id),
           gedcom_xref = coalesce(k.gedcom_xref, d.gedcom_xref),
           updated_at = now()
      from familee.sources d
     where k.id = p_keep
       and d.id = p_drop;

    delete from familee.sources where tree_id = p_tree and id = p_drop;

    return jsonb_build_object(
        'citations', v_citations,
        'notes', v_notes,
        'links', v_links
    );
end;
$$;

comment on function familee.merge_sources(uuid, uuid, uuid) is
    'Moves everything that points at one source onto another and removes the empty record';

insert into familee.schema_migrations (version)
values ('0015_place_source_merge')
on conflict do nothing;

commit;
