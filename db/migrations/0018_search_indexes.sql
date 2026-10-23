-- Familee - the indexes the search needs
--
-- The search asks ILIKE '%word%' of a dozen text columns (src/lib/library.ts). Without a trigram
-- index every such query reads the whole table: person_names and places.name got theirs in
-- 0000_init.sql, and these are the columns that were left without one. A word of three letters or
-- more now finds its rows through the GIN index, and the tree_id filter is combined with it.
--
-- The indexes are not partial or composite: the search always filters by tree, but a trigram scan
-- over a column of one archive is small, and a composite GIN would need the tree in every query's
-- shape - one of them (media_links.caption) is read without one.
--
-- The index names follow the column they serve; `if not exists` keeps the migration repeatable.

begin;

create index if not exists places_full_name_trgm_idx
    on familee.places using gin (full_name gin_trgm_ops);

create index if not exists sources_title_trgm_idx
    on familee.sources using gin (title gin_trgm_ops);
create index if not exists sources_author_trgm_idx
    on familee.sources using gin (author gin_trgm_ops);

create index if not exists notes_title_trgm_idx
    on familee.notes using gin (title gin_trgm_ops);
create index if not exists notes_body_trgm_idx
    on familee.notes using gin (body gin_trgm_ops);

create index if not exists events_value_trgm_idx
    on familee.events using gin (value gin_trgm_ops);
create index if not exists events_description_trgm_idx
    on familee.events using gin (description gin_trgm_ops);

create index if not exists media_title_trgm_idx
    on familee.media using gin (title gin_trgm_ops);
create index if not exists media_description_trgm_idx
    on familee.media using gin (description gin_trgm_ops);
create index if not exists media_original_filename_trgm_idx
    on familee.media using gin (original_filename gin_trgm_ops);

create index if not exists media_links_caption_trgm_idx
    on familee.media_links using gin (caption gin_trgm_ops);

insert into familee.schema_migrations (version)
values ('0018_search_indexes')
on conflict do nothing;

commit;
