-- Familee - the people who are in a photograph
--
-- media_links says whose album a photograph is in. "Who is on it" is a different question: one
-- photograph has one owner and any number of people in it, so the two do not share a table. A tag
-- carries its own tree, so it disappears with the person it names and leaves with the tree.
--
-- The unique (tree_id, id) on media is what lets a tag point at a photograph with the composite
-- key the rest of the schema uses, so a row of one tree can never reach into another.

begin;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'media_tree_id_id_key') then
        alter table familee.media add constraint media_tree_id_id_key unique (tree_id, id);
    end if;
end $$;

create table if not exists familee.media_people (
    id uuid primary key default gen_random_uuid(),
    tree_id uuid not null references familee.trees (id) on delete cascade,
    media_id uuid not null,
    person_id uuid not null,
    created_by text references familee.users (id) on delete set null,
    created_at timestamptz not null default now(),
    foreign key (tree_id, media_id) references familee.media (tree_id, id) on delete cascade,
    foreign key (tree_id, person_id) references familee.persons (tree_id, id) on delete cascade
);

comment on table familee.media_people is
    'Who is in a photograph: a tag, apart from the album the photograph belongs to';

create unique index if not exists media_people_media_person_key
    on familee.media_people (media_id, person_id);

create index if not exists media_people_person_idx
    on familee.media_people (person_id);

insert into familee.schema_migrations (version)
values ('0014_media_people')
on conflict do nothing;

commit;
