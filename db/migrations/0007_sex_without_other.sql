-- Familee - migration 0007: the sex of a person is male, female or unknown
--
-- The value "other" is removed: every person has a sex of one kind or the other, or
-- the sex is not known. Existing "other" rows become "unknown". GEDCOM files that mark
-- a person with X (intersex) are read as unknown from now on.
--
-- PostgreSQL cannot drop a value from an enum, so the type is rebuilt. The view
-- familee.person_cards uses persons.sex, so it is dropped before the column changes
-- and created again below with the same definition as in 0001_functions.sql. Keep the
-- two copies identical when the view changes.
--
-- The block runs only while the old value still exists, so replaying the migrations
-- is safe.
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
           and t.typname = 'sex'
           and e.enumlabel = 'other'
    ) then
        update familee.persons set sex = 'unknown' where sex::text = 'other';

        drop view if exists familee.person_cards;

        alter table familee.persons alter column sex drop default;
        alter type familee.sex rename to sex_old;
        create type familee.sex as enum ('male', 'female', 'unknown');
        alter table familee.persons
            alter column sex type familee.sex using sex::text::familee.sex,
            alter column sex set default 'unknown';
        drop type familee.sex_old;
    end if;
end $$;

-- The same view as in 0001_functions.sql, recreated after the column changed type.
drop view if exists familee.person_cards;

create view familee.person_cards as
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
) mv on true;

comment on view familee.person_cards is
    'Person card for the tree: name, years, place, portrait and its variants';

insert into familee.schema_migrations (version)
values ('0007_sex_without_other')
on conflict do nothing;

commit;
