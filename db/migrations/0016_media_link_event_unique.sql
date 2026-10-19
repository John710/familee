-- Familee - one photograph is linked to an event once
--
-- media_links has a unique index per person since 0000 (media_links_media_person_key), so adding
-- the same file to a person's album twice is a no-op. An event had none: the application read the
-- links of the event, saw no copy and inserted, and two requests at once could both pass the read
-- and insert two links. The index makes the database the one that decides, and the insert says
-- "on conflict do nothing" (see src/lib/photos.ts, addEventPhoto).
--
-- A duplicate that the race left behind is dropped before the index is made, keeping the oldest
-- link of each media/event pair: the file and the event stay, only the repeated link goes.

begin;

delete from familee.media_links ml
 where ml.event_id is not null
   and exists (
       select 1
         from familee.media_links k
        where k.media_id = ml.media_id
          and k.event_id = ml.event_id
          and (k.created_at, k.id) < (ml.created_at, ml.id)
   );

create unique index if not exists media_links_media_event_key
    on familee.media_links (media_id, event_id)
    where event_id is not null;

insert into familee.schema_migrations (version)
values ('0016_media_link_event_unique')
on conflict do nothing;

commit;
