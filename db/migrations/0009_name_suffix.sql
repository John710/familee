-- Familee - migration 0009: the name suffix ("Jr.", "III") is part of the name
--
-- The suffix was kept only as a line in the notes of an imported person, so cards and
-- lists did not show it. Now it is a field of the name, and the generated display string
-- ("Surname Given Patronymic") ends with it. Existing imports are moved over: the suffix
-- line is read from the notes into the field and removed from the notes.
--
-- The generated column is rebuilt, which takes its index and the person_cards view with it;
-- the view is created again below with the definition of 0007. Keep the two copies identical
-- when the view changes.

begin;

drop view if exists familee.person_cards;
drop index if exists familee.person_names_display_trgm_idx;

alter table familee.person_names drop column if exists display;
alter table familee.person_names
    add column display text generated always as (
        btrim(
            coalesce(nullif(btrim(surname),    '') || ' ', '') ||
            coalesce(nullif(btrim(given),      '') || ' ', '') ||
            coalesce(nullif(btrim(patronymic), '') || ' ', '') ||
            coalesce(nullif(btrim(suffix),     ''), '')
        )
    ) stored;

create index if not exists person_names_display_trgm_idx
    on familee.person_names using gin (display gin_trgm_ops);

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

-- Imported suffixes: the line the importer wrote into the notes, in either language of the
-- interface, becomes the suffix of the primary name (only where there is none yet), and the
-- line leaves the notes. The Russian word is written as escapes, so the code stays in English.
update familee.person_names n
   set suffix = btrim(substring(p.notes from E'(?m)^(?:суффикс в файле|suffix in file): (.+)$'))
  from familee.persons p
 where p.id = n.person_id
   and n.is_primary
   and (n.suffix is null or n.suffix = '')
   and p.notes ~ E'(?m)^(?:суффикс в файле|suffix in file): ';

update familee.persons
   set notes = nullif(btrim(regexp_replace(
           notes,
           E'(^|\\n)(?:суффикс в файле|suffix in file): [^\\n]*',
           '', 'g'), E' \n'), '')
 where notes ~ E'(?m)^(?:суффикс в файле|suffix in file): ';

insert into familee.schema_migrations (version)
values ('0009_name_suffix')
on conflict do nothing;

commit;
