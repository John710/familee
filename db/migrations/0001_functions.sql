-- =====================================================================
--  Familee - 0001_functions
--
--  Database-level logic: whatever has to happen no matter which code path
--  the data arrived through (the web interface, a GEDCOM import, hand-written
--  SQL during a restore). Not a single string here is ever shown to a user:
--  every caption lives in messages/<locale>.json, and the database returns
--  nothing but codes and values.
--
--  Applied on top of 0000_init.sql. Idempotent: create or replace for
--  functions, drop + create for triggers.
-- =====================================================================

begin;

set local search_path = familee, public;


-- =====================================================================
--  1. SHARED UTILITIES
-- =====================================================================

-- updated_at. If the application set the value explicitly (during an import,
-- for instance, to keep the original timestamps) it is left alone.
create or replace function familee.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    if new.updated_at is not distinct from old.updated_at then
        new.updated_at := now();
    end if;
    return new;
end $$;

comment on function familee.set_updated_at() is
    'Sets updated_at unless the application supplied it explicitly';

-- Attach the trigger to every table of the schema that has updated_at.
-- A loop instead of 17 separate create trigger statements: a new table with
-- that column picks the trigger up by itself on the next run.
do $$
declare
    r    record;
    trig text;
begin
    for r in
        select c.table_name
          from information_schema.columns c
          join information_schema.tables  t
            on t.table_schema = c.table_schema
           and t.table_name   = c.table_name
         where c.table_schema = 'familee'
           and c.column_name  = 'updated_at'
           and t.table_type   = 'BASE TABLE'
         order by c.table_name
    loop
        trig := 'trg_' || r.table_name || '_updated_at';

        execute format('drop trigger if exists %I on familee.%I', trig, r.table_name);
        execute format(
            'create trigger %I before update on familee.%I '
            'for each row execute function familee.set_updated_at()',
            trig, r.table_name
        );
    end loop;
end $$;


-- The tree an entity belongs to. Needed for checks such as "the photograph
-- and the person come from the same tree" in places where a composite
-- foreign key (tree_id, id) cannot be used: media_links and citations have
-- no tree_id column of their own.
create or replace function familee.tree_of(p_kind text, p_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
    v_tree uuid;
begin
    if p_id is null then
        return null;
    end if;

    case p_kind
        when 'person' then
            select p.tree_id into v_tree from familee.persons p where p.id = p_id;
        when 'family' then
            select f.tree_id into v_tree from familee.families f where f.id = p_id;
        when 'event' then
            select e.tree_id into v_tree from familee.events e where e.id = p_id;
        when 'place' then
            select pl.tree_id into v_tree from familee.places pl where pl.id = p_id;
        when 'source' then
            select s.tree_id into v_tree from familee.sources s where s.id = p_id;
        when 'repository' then
            select rp.tree_id into v_tree from familee.repositories rp where rp.id = p_id;
        when 'media' then
            select m.tree_id into v_tree from familee.media m where m.id = p_id;
        else
            raise exception 'familee.tree_of: unknown kind %', p_kind
                using errcode = 'invalid_parameter_value';
    end case;

    return v_tree;
end $$;

comment on function familee.tree_of(text, uuid) is
    'tree_id of an entity given its kind and id; null when p_id is null';


-- Whether a person is alive. Priority: the explicit persons.is_living, then
-- the presence of a death event, then the age relative to
-- trees.living_cutoff_years. null means unknown.
create or replace function familee.derive_is_living(
    p_explicit     boolean,
    p_birth        date,
    p_has_death    boolean,
    p_cutoff_years int
)
returns boolean
language sql
stable
parallel safe
as $$
    select case
        when p_explicit is not null then p_explicit
        when p_has_death           then false
        when p_birth is not null and p_cutoff_years is not null
             then p_birth > (current_date - make_interval(years => p_cutoff_years))
        else null
    end;
$$;

comment on function familee.derive_is_living(boolean, date, boolean, int) is
    'Derives the "living" flag used to hide data about living people';


-- Validates the relation_by_partner map: the keys are partner uuids, the
-- values are familee.child_relation labels. The function is immutable, which
-- is what allows it to be used in a check constraint.
create or replace function familee.is_child_relation_map(p jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
    select coalesce(
        bool_and(
            kv.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and kv.value in (
                'biological', 'adopted', 'step', 'foster',
                'guardianship', 'sealing', 'unknown'
            )
        ),
        true
    )
    from jsonb_each_text(coalesce(p, '{}'::jsonb)) as kv(key, value);
$$;

alter table familee.family_children
    drop constraint if exists family_children_relation_by_partner_valid;
alter table familee.family_children
    add constraint family_children_relation_by_partner_valid
        check (familee.is_child_relation_map(relation_by_partner));


-- =====================================================================
--  2. PLACES: the cached full name and the integrity of the hierarchy
--
--  full_name is stored rather than computed on the fly: it shows up in the
--  caption of every event of every card, and walking the hierarchy upwards
--  for every row of a result set is far too expensive.
-- =====================================================================

-- Recomputes a subtree. Called after a name or a parent changed:
-- "Tula" becomes "Tula, Tula Oblast, Russia", and so does every child.
create or replace function familee.places_refresh_subtree(p_root uuid)
returns void
language sql
as $$
    with recursive sub (id, full_name, depth) as (
        select p.id, p.full_name, 0
          from familee.places p
         where p.id = p_root
        union all
        select c.id,
               btrim(c.name) || coalesce(', ' || nullif(btrim(s.full_name), ''), ''),
               s.depth + 1
          from sub s
          join familee.places c on c.parent_id = s.id
         where s.depth < 32
    )
    update familee.places t
       set full_name = sub.full_name
      from sub
     where t.id = sub.id
       and t.full_name is distinct from sub.full_name;
$$;

comment on function familee.places_refresh_subtree(uuid) is
    'Recomputes places.full_name for a place and all of its descendants';


create or replace function familee.places_before_write()
returns trigger
language plpgsql
as $$
declare
    v_parent_tree uuid;
    v_parent_name text;
    v_cursor      uuid;
    v_depth       int := 0;
begin
    new.name := btrim(new.name);

    if new.parent_id is not null then
        -- the parent has to come from the same tree
        v_parent_tree := familee.tree_of('place', new.parent_id);
        if v_parent_tree is distinct from new.tree_id then
            raise exception
                'familee.places: parent % belongs to another tree', new.parent_id
                using errcode = 'foreign_key_violation';
        end if;

        -- a cycle in the place hierarchy: a place cannot sit inside itself
        v_cursor := new.parent_id;
        while v_cursor is not null and v_depth < 64 loop
            if v_cursor = new.id then
                raise exception
                    'familee.places: cycle in hierarchy at %', new.id
                    using errcode = 'check_violation';
            end if;
            select p.parent_id into v_cursor
              from familee.places p
             where p.id = v_cursor;
            v_depth := v_depth + 1;
        end loop;

        select nullif(btrim(p.full_name), '') into v_parent_name
          from familee.places p
         where p.id = new.parent_id;
    end if;

    new.full_name := new.name || coalesce(', ' || v_parent_name, '');
    return new;
end $$;

drop trigger if exists trg_places_before_write on familee.places;
create trigger trg_places_before_write
    before insert or update of name, parent_id, tree_id on familee.places
    for each row execute function familee.places_before_write();


-- The name or the parent changed, so the descendants have to be refreshed.
-- The when clause guarantees that the update performed inside
-- places_refresh_subtree (which only touches full_name) does not fire the
-- trigger a second time.
create or replace function familee.places_after_write()
returns trigger
language plpgsql
as $$
begin
    perform familee.places_refresh_subtree(new.id);
    return null;
end $$;

drop trigger if exists trg_places_after_write on familee.places;
create trigger trg_places_after_write
    after update on familee.places
    for each row
    when (old.name is distinct from new.name
          or old.parent_id is distinct from new.parent_id)
    execute function familee.places_after_write();


-- =====================================================================
--  3. PARENTAGE: protection against impossible relationships
--
--  Relational tools alone are not enough here: "a person cannot be their
--  own ancestor" is a statement about the transitive closure of a graph,
--  and neither a check constraint nor a foreign key can express it.
-- =====================================================================

-- Whether p_candidate is an ancestor of p_person (or is p_person).
create or replace function familee.is_ancestor_of(
    p_candidate uuid,
    p_person    uuid,
    p_max_depth int default 64
)
returns boolean
language sql
stable
as $$
    with recursive up (person_id, depth) as (
        select p_person, 0
        union
        select fp.person_id, up.depth + 1
          from up
          join familee.family_children fc on fc.person_id = up.person_id
          join familee.family_partners fp on fp.family_id = fc.family_id
         where up.depth < p_max_depth
           and fp.person_id <> up.person_id
    )
    select exists (
        select 1 from up where up.person_id = p_candidate and up.depth > 0
    );
$$;

comment on function familee.is_ancestor_of(uuid, uuid, int) is
    'true when p_candidate is an ancestor of p_person at any depth';


-- A child of a union: not a partner of that union, not its own ancestor.
create or replace function familee.family_children_check()
returns trigger
language plpgsql
as $$
begin
    if exists (
        select 1
          from familee.family_partners fp
         where fp.family_id = new.family_id
           and fp.person_id = new.person_id
    ) then
        raise exception
            'familee.family_children: person % is already a partner of family %',
            new.person_id, new.family_id
            using errcode = 'check_violation';
    end if;

    if familee.is_ancestor_of(new.person_id, new.person_id) then
        raise exception
            'familee.family_children: person % would become their own ancestor',
            new.person_id
            using errcode = 'check_violation';
    end if;

    return null;
end $$;

drop trigger if exists trg_family_children_check on familee.family_children;
create trigger trg_family_children_check
    after insert or update of family_id, person_id on familee.family_children
    for each row execute function familee.family_children_check();


-- A partner of a union: not a child of that same union. Adding a partner can
-- close a cycle too, since they become a parent of every child of the union.
create or replace function familee.family_partners_check()
returns trigger
language plpgsql
as $$
declare
    v_child uuid;
begin
    if exists (
        select 1
          from familee.family_children fc
         where fc.family_id = new.family_id
           and fc.person_id = new.person_id
    ) then
        raise exception
            'familee.family_partners: person % is already a child of family %',
            new.person_id, new.family_id
            using errcode = 'check_violation';
    end if;

    for v_child in
        select fc.person_id
          from familee.family_children fc
         where fc.family_id = new.family_id
    loop
        if familee.is_ancestor_of(v_child, v_child) then
            raise exception
                'familee.family_partners: partner % closes a pedigree cycle through %',
                new.person_id, v_child
                using errcode = 'check_violation';
        end if;
    end loop;

    return null;
end $$;

drop trigger if exists trg_family_partners_check on familee.family_partners;
create trigger trg_family_partners_check
    after insert or update of family_id, person_id on familee.family_partners
    for each row execute function familee.family_partners_check();


-- =====================================================================
--  4. EXACTLY ONE PRIMARY ROW
--
--  The partial unique indexes from 0000 forbid two "primary" values, but on
--  their own they would leave the application to clear the previous one by
--  hand and in the right order. The triggers do it themselves: marking a
--  row as primary demotes the one that used to be.
-- =====================================================================

create or replace function familee.person_names_single_primary()
returns trigger
language plpgsql
as $$
begin
    -- the first name of a person is always the primary one
    if tg_op = 'INSERT' and not new.is_primary then
        if not exists (
            select 1 from familee.person_names n
             where n.person_id = new.person_id and n.is_primary
        ) then
            new.is_primary := true;
        end if;
    end if;

    if new.is_primary then
        update familee.person_names n
           set is_primary = false
         where n.person_id = new.person_id
           and n.id <> new.id
           and n.is_primary;
    end if;

    return new;
end $$;

drop trigger if exists trg_person_names_single_primary on familee.person_names;
create trigger trg_person_names_single_primary
    before insert or update of is_primary, person_id on familee.person_names
    for each row execute function familee.person_names_single_primary();


create or replace function familee.events_single_primary()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'INSERT' and not new.is_primary then
        if new.person_id is not null and not exists (
            select 1 from familee.events e
             where e.person_id = new.person_id
               and e.type_code = new.type_code
               and e.is_primary
        ) then
            new.is_primary := true;
        elsif new.family_id is not null and not exists (
            select 1 from familee.events e
             where e.family_id = new.family_id
               and e.type_code = new.type_code
               and e.is_primary
        ) then
            new.is_primary := true;
        end if;
    end if;

    if new.is_primary then
        update familee.events e
           set is_primary = false
         where e.type_code = new.type_code
           and e.id <> new.id
           and e.is_primary
           and (
               (new.person_id is not null and e.person_id = new.person_id) or
               (new.family_id is not null and e.family_id = new.family_id)
           );
    end if;

    return new;
end $$;


create or replace function familee.media_links_single_primary()
returns trigger
language plpgsql
as $$
begin
    if new.is_primary and new.person_id is not null then
        update familee.media_links ml
           set is_primary = false
         where ml.person_id = new.person_id
           and ml.id <> new.id
           and ml.is_primary;
    end if;

    return new;
end $$;


-- =====================================================================
--  5. RELATIONSHIP CHECKS THAT A FOREIGN KEY CANNOT EXPRESS
-- =====================================================================

-- Event: the place comes from the same tree; the type fits the subject.
create or replace function familee.events_check()
returns trigger
language plpgsql
as $$
declare
    v_scope familee.event_scope;
begin
    if new.place_id is not null
       and familee.tree_of('place', new.place_id) is distinct from new.tree_id then
        raise exception
            'familee.events: place % belongs to another tree', new.place_id
            using errcode = 'foreign_key_violation';
    end if;

    select et.applies_to into v_scope
      from familee.event_types et
     where et.code = new.type_code;

    if v_scope = 'person' and new.person_id is null then
        raise exception
            'familee.events: type % applies to persons only', new.type_code
            using errcode = 'check_violation';
    end if;

    if v_scope = 'family' and new.family_id is null then
        raise exception
            'familee.events: type % applies to families only', new.type_code
            using errcode = 'check_violation';
    end if;

    return new;
end $$;

drop trigger if exists trg_events_check on familee.events;
create trigger trg_events_check
    before insert or update of tree_id, type_code, person_id, family_id, place_id
    on familee.events
    for each row execute function familee.events_check();

-- A separate trigger for the single primary event. Triggers in Postgres fire
-- in alphabetical order of their names, so the check (trg_events_check) runs
-- before the assignment (trg_events_primary).
drop trigger if exists trg_events_primary on familee.events;
create trigger trg_events_primary
    before insert or update of is_primary, type_code, person_id, family_id
    on familee.events
    for each row execute function familee.events_single_primary();


-- Media: the place where the photograph was taken is from the same tree.
create or replace function familee.media_check()
returns trigger
language plpgsql
as $$
begin
    if new.place_id is not null
       and familee.tree_of('place', new.place_id) is distinct from new.tree_id then
        raise exception
            'familee.media: place % belongs to another tree', new.place_id
            using errcode = 'foreign_key_violation';
    end if;
    return new;
end $$;

drop trigger if exists trg_media_check on familee.media;
create trigger trg_media_check
    before insert or update of tree_id, place_id on familee.media
    for each row execute function familee.media_check();


-- A media link: the file and the object it is attached to share one tree.
create or replace function familee.media_links_check()
returns trigger
language plpgsql
as $$
declare
    v_media  uuid;
    v_target uuid;
begin
    v_media := familee.tree_of('media', new.media_id);

    v_target := coalesce(
        familee.tree_of('person', new.person_id),
        familee.tree_of('family', new.family_id),
        familee.tree_of('event',  new.event_id),
        familee.tree_of('place',  new.place_id),
        familee.tree_of('source', new.source_id)
    );

    if v_media is not null and v_target is not null and v_media <> v_target then
        raise exception
            'familee.media_links: media % and its target belong to different trees',
            new.media_id
            using errcode = 'foreign_key_violation';
    end if;

    return new;
end $$;

drop trigger if exists trg_media_links_check on familee.media_links;
create trigger trg_media_links_check
    before insert or update on familee.media_links
    for each row execute function familee.media_links_check();

drop trigger if exists trg_media_links_primary on familee.media_links;
create trigger trg_media_links_primary
    before insert or update of is_primary, person_id on familee.media_links
    for each row execute function familee.media_links_single_primary();


-- A citation: the source and the object it describes share one tree.
create or replace function familee.citations_check()
returns trigger
language plpgsql
as $$
declare
    v_source uuid;
    v_target uuid;
begin
    v_source := familee.tree_of('source', new.source_id);

    v_target := coalesce(
        familee.tree_of('person', new.person_id),
        familee.tree_of('family', new.family_id),
        familee.tree_of('event',  new.event_id)
    );

    if v_source is not null and v_target is not null and v_source <> v_target then
        raise exception
            'familee.citations: source % and its target belong to different trees',
            new.source_id
            using errcode = 'foreign_key_violation';
    end if;

    return new;
end $$;

drop trigger if exists trg_citations_check on familee.citations;
create trigger trg_citations_check
    before insert or update on familee.citations
    for each row execute function familee.citations_check();


-- A tree member: self_person_id has to point at a person of that tree.
create or replace function familee.tree_members_check()
returns trigger
language plpgsql
as $$
begin
    if new.self_person_id is not null
       and familee.tree_of('person', new.self_person_id) is distinct from new.tree_id then
        raise exception
            'familee.tree_members: person % belongs to another tree', new.self_person_id
            using errcode = 'foreign_key_violation';
    end if;
    return new;
end $$;

drop trigger if exists trg_tree_members_check on familee.tree_members;
create trigger trg_tree_members_check
    before insert or update of tree_id, self_person_id on familee.tree_members
    for each row execute function familee.tree_members_check();


-- =====================================================================
--  6. WALKING THE KINSHIP GRAPH
--
--  path guards against looping more reliably than a depth counter: the walk
--  stops at the first repetition instead of after twenty turns.
--  Kinship goes through unions: a person has no mother/father columns.
-- =====================================================================

-- Ancestors. depth = 1 is the parents, 2 the grandparents, and so on.
-- p_relations filters by relation type: passing only 'biological' yields a
-- biological pedigree with no adoptive lines in it.
create or replace function familee.ancestors(
    p_person    uuid,
    p_max_depth int default 20,
    p_relations familee.child_relation[] default null
)
returns table (
    person_id  uuid,
    depth      int,
    via_family uuid,
    relation   familee.child_relation,
    path       uuid[]
)
language sql
stable
as $$
    with recursive up (person_id, depth, via_family, relation, path) as (
        select fp.person_id,
               1,
               fc.family_id,
               fc.relation,
               array[p_person, fp.person_id]
          from familee.family_children fc
          join familee.family_partners fp on fp.family_id = fc.family_id
         where fc.person_id = p_person
           and fp.person_id <> p_person
           and (p_relations is null or fc.relation = any (p_relations))
        union all
        select fp.person_id,
               up.depth + 1,
               fc.family_id,
               fc.relation,
               up.path || fp.person_id
          from up
          join familee.family_children fc on fc.person_id = up.person_id
          join familee.family_partners fp on fp.family_id = fc.family_id
         where up.depth < p_max_depth
           and fp.person_id <> up.person_id
           and not (fp.person_id = any (up.path))
           and (p_relations is null or fc.relation = any (p_relations))
    )
    select up.person_id, up.depth, up.via_family, up.relation, up.path
      from up;
$$;

comment on function familee.ancestors(uuid, int, familee.child_relation[]) is
    'Ancestors of a person with depth, union and relation at every step';


-- Descendants. Symmetrical to ancestors.
create or replace function familee.descendants(
    p_person    uuid,
    p_max_depth int default 20,
    p_relations familee.child_relation[] default null
)
returns table (
    person_id  uuid,
    depth      int,
    via_family uuid,
    relation   familee.child_relation,
    path       uuid[]
)
language sql
stable
as $$
    with recursive down (person_id, depth, via_family, relation, path) as (
        select fc.person_id,
               1,
               fc.family_id,
               fc.relation,
               array[p_person, fc.person_id]
          from familee.family_partners fp
          join familee.family_children fc on fc.family_id = fp.family_id
         where fp.person_id = p_person
           and fc.person_id <> p_person
           and (p_relations is null or fc.relation = any (p_relations))
        union all
        select fc.person_id,
               down.depth + 1,
               fc.family_id,
               fc.relation,
               down.path || fc.person_id
          from down
          join familee.family_partners fp on fp.person_id = down.person_id
          join familee.family_children fc on fc.family_id = fp.family_id
         where down.depth < p_max_depth
           and fc.person_id <> down.person_id
           and not (fc.person_id = any (down.path))
           and (p_relations is null or fc.relation = any (p_relations))
    )
    select down.person_id, down.depth, down.via_family, down.relation, down.path
      from down;
$$;

comment on function familee.descendants(uuid, int, familee.child_relation[]) is
    'Descendants of a person with depth, union and relation at every step';


-- The nearest common ancestor and the distances to it. The name of the
-- degree ("second cousin") is composed by the application out of the pair
-- of numbers, so it gets translated along with the rest of the interface.
create or replace function familee.kinship(
    p_a         uuid,
    p_b         uuid,
    p_max_depth int default 20
)
returns table (
    common_ancestor uuid,
    depth_a         int,
    depth_b         int
)
language sql
stable
as $$
    with a (pid, d) as (
        select p_a, 0
        union all
        select an.person_id, an.depth from familee.ancestors(p_a, p_max_depth) an
    ),
    b (pid, d) as (
        select p_b, 0
        union all
        select bn.person_id, bn.depth from familee.ancestors(p_b, p_max_depth) bn
    ),
    pairs (pid, da, db) as (
        select a.pid, min(a.d), min(b.d)
          from a
          join b on b.pid = a.pid
         group by a.pid
    )
    select pairs.pid, pairs.da, pairs.db
      from pairs
     order by pairs.da + pairs.db, greatest(pairs.da, pairs.db)
     limit 1;
$$;

comment on function familee.kinship(uuid, uuid, int) is
    'Nearest common ancestor of two persons and the distances to it in generations';


-- The full name as one string: the primary name, else the earliest one.
create or replace function familee.person_display_name(p_person uuid)
returns text
language sql
stable
parallel safe
as $$
    select n.display
      from familee.person_names n
     where n.person_id = p_person
     order by n.is_primary desc, n.created_at
     limit 1;
$$;


-- Search by name. The full-text index answers exact matches, the trigrams
-- answer typos and partial input ("Ivannov" still finds "Ivanov").
create or replace function familee.search_persons(
    p_tree  uuid,
    p_query text,
    p_limit int default 20
)
returns table (
    person_id uuid,
    display   text,
    score     real
)
language sql
stable
as $$
    select n.person_id,
           n.display,
           greatest(
               ts_rank(n.search_vector, websearch_to_tsquery('simple', p_query)),
               similarity(coalesce(n.display, ''),  p_query),
               similarity(coalesce(n.surname, ''), p_query)
           )::real
      from familee.person_names n
      join familee.persons p on p.id = n.person_id
     where p.tree_id = p_tree
       and btrim(coalesce(p_query, '')) <> ''
       and (
           n.search_vector @@ websearch_to_tsquery('simple', p_query)
           or n.display % p_query
           or n.surname % p_query
       )
     order by 3 desc, 2
     limit greatest(coalesce(p_limit, 20), 1);
$$;

comment on function familee.search_persons(uuid, text, int) is
    'Person search by name: full-text matching plus fuzzy trigram matching';


-- =====================================================================
--  7. VIEWS FOR THE INTERFACE
-- =====================================================================

-- Parent -> child edges, for laying the tree out on the client.
-- effective_relation takes relation_by_partner into account: a child can be
-- biological to the mother and adopted by the father.
create or replace view familee.parent_child as
select
    fc.tree_id,
    fp.person_id as parent_id,
    fc.person_id as child_id,
    fc.family_id,
    fp.role      as parent_role,
    fc.relation,
    coalesce(
        (fc.relation_by_partner ->> fp.person_id::text)::familee.child_relation,
        fc.relation
    )            as effective_relation,
    fc.birth_order
from familee.family_children fc
join familee.family_partners fp
  on fp.family_id = fc.family_id
 and fp.person_id <> fc.person_id;

comment on view familee.parent_child is
    'Flat list of parent-child links, unfolded from the unions';


-- The data behind a tree card: the full name, the life years, the portrait.
-- Every caption (sex, event type, "unknown") is produced by the application
-- from the keys in messages/<locale>.json; here there are codes and dates.
create or replace view familee.person_cards as
select
    p.id        as person_id,
    p.tree_id,
    p.sex,
    p.privacy,
    p.headline,
    p.sort_order,
    p.gedcom_xref,

    n.display   as full_name,
    n.surname,
    n.given,
    n.patronymic,
    n.nickname,
    n.surname_at_birth,

    birth.id             as birth_event_id,
    birth.date_start     as birth_date,
    birth.date_end       as birth_date_end,
    birth.date_qualifier as birth_qualifier,
    birth.date_precision as birth_precision,
    birth.date_original  as birth_original,
    extract(year from birth.date_start)::int as birth_year,
    bp.full_name         as birth_place,

    death.id             as death_event_id,
    death.date_start     as death_date,
    death.date_end       as death_date_end,
    death.date_qualifier as death_qualifier,
    death.date_precision as death_precision,
    death.date_original  as death_original,
    extract(year from death.date_start)::int as death_year,
    dp.full_name         as death_place,

    familee.derive_is_living(
        p.is_living,
        birth.date_start,
        death.id is not null,
        t.living_cutoff_years
    ) as is_living,

    t.hide_living,

    ml.media_id          as portrait_media_id,
    m.storage_key        as portrait_storage_key,
    m.width              as portrait_width,
    m.height             as portrait_height,
    ml.crop_x,
    ml.crop_y,
    ml.crop_w,
    ml.crop_h,
    mv.keys              as portrait_variants,

    p.updated_at
from familee.persons p
join familee.trees t
  on t.id = p.tree_id
left join familee.person_names n
  on n.person_id = p.id and n.is_primary
left join familee.events birth
  on birth.person_id = p.id and birth.type_code = 'birth' and birth.is_primary
left join familee.events death
  on death.person_id = p.id and death.type_code = 'death' and death.is_primary
left join familee.places bp on bp.id = birth.place_id
left join familee.places dp on dp.id = death.place_id
left join familee.media_links ml
  on ml.person_id = p.id and ml.is_primary
left join familee.media m on m.id = ml.media_id
left join lateral (
    select jsonb_object_agg(v.variant::text || '.' || v.format, v.storage_key) as keys
      from familee.media_variants v
     where v.media_id = m.id
) mv on true;

comment on view familee.person_cards is
    'Person card for the tree: name, years, place, portrait and its variants';


insert into familee.schema_migrations (version)
values ('0001_functions')
on conflict do nothing;

commit;
