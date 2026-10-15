-- Familee - the trash: a deleted person waits instead of going at once
--
-- deleted_at marks a person as deleted without losing the row: the unions, the events, the notes
-- and the photographs stay where they are, so a restore is one update. Every read hides such a
-- person: person_cards and parent_child are redefined here with the filter, and the application
-- filters the few queries that read familee.persons directly.
--
-- A union is not marked at all. A union whose last living partner or child is in the trash simply
-- stops being shown - person_cards is empty for them and the layout drops a union without partners
-- - so nothing has to be remembered for a restore to be exact.

begin;

alter table familee.persons
    add column if not exists deleted_at timestamptz,
    add column if not exists deleted_by text references familee.users (id) on delete set null;

comment on column familee.persons.deleted_at is
    'When the person went to the trash; null - the person is in the tree';
comment on column familee.persons.deleted_by is
    'Who moved the person to the trash';

create index if not exists persons_trash_idx
    on familee.persons (tree_id, deleted_at desc)
    where deleted_at is not null;

-- Parent -> child edges: a person in the trash is neither a parent nor a child.
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
 and fp.person_id <> fc.person_id
join familee.persons pp on pp.id = fp.person_id
join familee.persons cp on cp.id = fc.person_id
where pp.deleted_at is null
  and cp.deleted_at is null;

-- The data behind a tree card: a person in the trash has no card anywhere.
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
        death.date_start is not null
    ) as is_living,

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
) mv on true
where p.deleted_at is null;

insert into familee.schema_migrations (version)
values ('0012_soft_delete')
on conflict do nothing;

commit;
