-- =====================================================================
--  Familee - demo data
--
--  The Callahan family: a fictional American family from Pittsburgh and Cleveland,
--  four generations, with immigration from Ireland, a war death in Normandy, two
--  marriages of one man, a stepson, an adopted son, a single mother, an annulled
--  marriage, a civil union, a separation and a living generation. Every place of
--  the archive is used: the places, sources, citations, notes and photographs
--  all have something to show.
--
--  Nothing in it is a real person. The places are real towns; the people, the
--  documents and the cemeteries of the family are invented.
--
--  Run it after db/migrations/*.sql:
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed.sql
--
--  CAREFUL: every run deletes the tree with the slug 'demo' in full and creates it
--  anew. Do not keep any data of your own in it. Real trees are left untouched.
--  Photographs are not in the seed (they are files, not rows).
--
--  The fuzzy-date convention used here, which the rest of the application follows
--  as well: date_start is always a concrete date, and how much to trust it is said by
--  date_precision. A year is stored as January 1st with precision = 'year', a month as
--  the first day with precision = 'month'. Such a date must never be displayed in
--  full: the interface truncates it according to precision.
-- =====================================================================

begin;

delete from familee.trees where slug = 'demo';

-- Helpers for the identifiers of this seed only: they live in the session and are
-- gone when it ends. Each kind of object has its own block of identifiers.
create or replace function pg_temp.person(n int) returns uuid language sql immutable as
$$ select ('22222222-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.family(n int) returns uuid language sql immutable as
$$ select ('33333333-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.place(n int) returns uuid language sql immutable as
$$ select ('44444444-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.repository(n int) returns uuid language sql immutable as
$$ select ('55555555-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.source(n int) returns uuid language sql immutable as
$$ select ('66666666-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- ─── The tree ───────────────────────────────────────────────────────
insert into familee.trees (id, slug, title, description, default_locale) values (
    '11111111-1111-4111-8111-111111111111',
    'demo',
    'Demo: the Callahan family',
    'A fictional American family from Pittsburgh and Cleveland, four generations. Shows every feature of Familee.',
    'en'
);

-- ─── Places ─────────────────────────────────────────────────────────
-- full_name ("Pittsburgh, Pennsylvania, United States") is filled in by the trigger.
insert into familee.places (id, tree_id, parent_id, name, kind, latitude, longitude, former_names, notes) values
    (pg_temp.place(1),  '11111111-1111-4111-8111-111111111111', null, 'United States', 'country', null, null, '{}', null),
    (pg_temp.place(2),  '11111111-1111-4111-8111-111111111111', pg_temp.place(1), 'Pennsylvania', 'region', null, null, '{}', null),
    (pg_temp.place(3),  '11111111-1111-4111-8111-111111111111', pg_temp.place(2), 'Pittsburgh', 'city', 40.440624, -79.995886, '{}',
        'Steel city on the rivers. The Callahans lived on the South Side for three generations.'),
    (pg_temp.place(4),  '11111111-1111-4111-8111-111111111111', pg_temp.place(3), 'Calvary Cemetery', 'cemetery', null, null, '{}', null),
    (pg_temp.place(5),  '11111111-1111-4111-8111-111111111111', pg_temp.place(3), 'St. Patrick''s Church', 'church', null, null, '{}', null),
    (pg_temp.place(6),  '11111111-1111-4111-8111-111111111111', pg_temp.place(1), 'Ellis Island', 'building', 40.699680, -74.039908, '{}',
        'The immigration station in New York Harbor.'),
    (pg_temp.place(7),  '11111111-1111-4111-8111-111111111111', null, 'Ireland', 'country', null, null, '{"Irish Free State"}', null),
    (pg_temp.place(8),  '11111111-1111-4111-8111-111111111111', pg_temp.place(7), 'County Cork', 'region', null, null, '{}', null),
    (pg_temp.place(9),  '11111111-1111-4111-8111-111111111111', pg_temp.place(8), 'Cork', 'city', 51.896892, -8.486316, '{}', null),
    (pg_temp.place(10), '11111111-1111-4111-8111-111111111111', null, 'France', 'country', null, null, '{}', null),
    (pg_temp.place(11), '11111111-1111-4111-8111-111111111111', pg_temp.place(10), 'Normandy', 'region', null, null, '{}', null),
    (pg_temp.place(12), '11111111-1111-4111-8111-111111111111', pg_temp.place(11), 'Colleville-sur-Mer', 'town', 49.363000, -0.851000, '{}', null),
    (pg_temp.place(13), '11111111-1111-4111-8111-111111111111', pg_temp.place(12), 'Colleville Memorial Cemetery', 'cemetery', null, null, '{}',
        'A fictional burial ground for the family; the name is invented.'),
    (pg_temp.place(14), '11111111-1111-4111-8111-111111111111', pg_temp.place(1), 'Ohio', 'region', null, null, '{}', null),
    (pg_temp.place(15), '11111111-1111-4111-8111-111111111111', pg_temp.place(14), 'Cleveland', 'city', 41.499320, -81.694361, '{}',
        'The lakeshore city where the second generation moved in the 1920s.'),
    (pg_temp.place(16), '11111111-1111-4111-8111-111111111111', pg_temp.place(15), 'Mercy Hospital', 'hospital', null, null, '{}', null),
    (pg_temp.place(17), '11111111-1111-4111-8111-111111111111', pg_temp.place(15), 'Lake View Cemetery', 'cemetery', null, null, '{}', null),
    (pg_temp.place(18), '11111111-1111-4111-8111-111111111111', pg_temp.place(1), 'California', 'region', null, null, '{}', null),
    (pg_temp.place(19), '11111111-1111-4111-8111-111111111111', pg_temp.place(18), 'San Francisco', 'city', 37.774929, -122.419416, '{"Yerba Buena"}',
        'The city where the third generation settled after the war.'),
    (pg_temp.place(20), '11111111-1111-4111-8111-111111111111', pg_temp.place(19), 'Golden Hills Cemetery', 'cemetery', null, null, '{}', null),
    (pg_temp.place(21), '11111111-1111-4111-8111-111111111111', pg_temp.place(1), 'Illinois', 'region', null, null, '{}', null),
    (pg_temp.place(22), '11111111-1111-4111-8111-111111111111', pg_temp.place(21), 'Chicago', 'city', 41.878113, -87.629799, '{}', null),
    (pg_temp.place(23), '11111111-1111-4111-8111-111111111111', null, 'Sweden', 'country', null, null, '{}', null),
    (pg_temp.place(24), '11111111-1111-4111-8111-111111111111', pg_temp.place(23), 'Gothenburg', 'city', 57.708870, 11.974560, '{}', null);

-- ─── Repositories and sources ───────────────────────────────────────
insert into familee.repositories (id, tree_id, name, address, website, notes) values
    (pg_temp.repository(1), '11111111-1111-4111-8111-111111111111', 'Allegheny County Records Office',
        'Pittsburgh, Pennsylvania', 'https://records.example.org/allegheny', 'Census, church and court records.'),
    (pg_temp.repository(2), '11111111-1111-4111-8111-111111111111', 'Callahan family papers', null, null,
        'Kept by the family; photocopies are in the archive.'),
    (pg_temp.repository(3), '11111111-1111-4111-8111-111111111111', 'Military personnel records office', null, null,
        'Service and award records of the war years.');

insert into familee.sources (id, tree_id, repository_id, title, author, publication, call_number, text_excerpt, url) values
    (pg_temp.source(1), '11111111-1111-4111-8111-111111111111', pg_temp.repository(1),
        '1900 United States census, Pittsburgh, Ward 17', 'Census enumerator', 'Enumeration district 101', 'ED 101, sheet 14', null, null),
    (pg_temp.source(2), '11111111-1111-4111-8111-111111111111', null,
        'Passenger manifest, Ellis Island, 1889', 'Immigration inspectors', null, 'Manifest 22, line 18', null, null),
    (pg_temp.source(3), '11111111-1111-4111-8111-111111111111', pg_temp.repository(2),
        'Callahan family Bible', null, null, 'Inside cover',
        'Births and marriages written in the family''s hand, in three different inks.', null),
    (pg_temp.source(4), '11111111-1111-4111-8111-111111111111', pg_temp.repository(3),
        'Army service record of James Thomas Callahan', null, null, 'File 1944/231', null, null),
    (pg_temp.source(5), '11111111-1111-4111-8111-111111111111', pg_temp.repository(1),
        'Marriage register, St. Patrick''s Church, 1890', null, null, 'Book 4, page 88', null, null),
    (pg_temp.source(6), '11111111-1111-4111-8111-111111111111', pg_temp.repository(2),
        'Oral history interview with Walter Callahan, 2009', 'Interviewer: Lisa Brooks', null, 'Tape 1', null, null),
    (pg_temp.source(7), '11111111-1111-4111-8111-111111111111', pg_temp.repository(1),
        'Cleveland death index, 1981', null, null, 'Volume 23', null, null);

-- ─── People ─────────────────────────────────────────────────────────
-- Living people are shown to members only ('members'); the dead are 'public'; one
-- record is 'private' to show the level. The death date is the only thing that
-- marks a person as deceased, so is_living follows from it.
insert into familee.persons (id, tree_id, sex, is_living, privacy, headline, notes, gedcom_xref, sort_order) values
    (pg_temp.person(1),  '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Steelworker and founder of the line',
        'Left County Cork at twenty and worked the Pittsburgh mills for forty years.', '@I1@', 10),
    (pg_temp.person(2),  '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  null,
        'Ran a boarding house on the South Side.', '@I2@', 20),
    (pg_temp.person(3),  '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Machinist, killed in Normandy',
        'His letters from France survive in the family Bible box.', '@I3@', 30),
    (pg_temp.person(4),  '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  'Telephone operator',
        null, '@I4@', 40),
    (pg_temp.person(5),  '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Carpenter from Gothenburg',
        'Took the name Lindqvist after arriving in Pittsburgh.', '@I5@', 50),
    (pg_temp.person(6),  '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Master carpenter',
        'Built the family house on Ridge Road in Cleveland.', '@I6@', 60),
    (pg_temp.person(7),  '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  null,
        'Divorced in 1936.', '@I7@', 70),
    (pg_temp.person(8),  '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  'Head nurse at Mercy Hospital',
        null, '@I8@', 80),
    (pg_temp.person(9),  '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  null,
        'Taught piano in the parish school.', '@I9@', 90),
    (pg_temp.person(10), '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  'Piano teacher in San Francisco',
        null, '@I10@', 100),
    (pg_temp.person(11), '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Architect',
        'Lived in San Francisco with his partner Paul Mercer from 2010.', '@I11@', 110),
    (pg_temp.person(12), '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  null,
        'Adopted at eight months old.', '@I12@', 120),
    (pg_temp.person(13), '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  null,
        'Raised by her mother Ruth.', '@I13@', 130),
    (pg_temp.person(14), '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Civil engineer',
        'Recorded an interview in 2009; see the sources.', '@I14@', 140),
    (pg_temp.person(15), '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Insurance agent',
        null, '@I15@', 150),
    (pg_temp.person(16), '11111111-1111-4111-8111-111111111111', 'female', true,  'members', 'Journalist',
        'Keeps the family papers.', '@I16@', 160),
    (pg_temp.person(17), '11111111-1111-4111-8111-111111111111', 'male',   true,  'members', 'Physician',
        null, '@I17@', 170),
    (pg_temp.person(18), '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  'Teacher',
        null, '@I18@', 180),
    (pg_temp.person(19), '11111111-1111-4111-8111-111111111111', 'male',   false, 'public',  'Pharmacist',
        null, '@I19@', 190),
    (pg_temp.person(20), '11111111-1111-4111-8111-111111111111', 'female', true,  'members', 'Librarian',
        null, '@I20@', 200),
    (pg_temp.person(21), '11111111-1111-4111-8111-111111111111', 'male',   true,  'members', 'Software engineer',
        null, '@I21@', 210),
    (pg_temp.person(22), '11111111-1111-4111-8111-111111111111', 'female', true,  'members', 'Public health researcher',
        null, '@I22@', 220),
    (pg_temp.person(23), '11111111-1111-4111-8111-111111111111', 'male',   true,  'members', 'Contractor',
        null, '@I23@', 230),
    (pg_temp.person(24), '11111111-1111-4111-8111-111111111111', 'unknown', true, 'private', null,
        'Details are visible to the owners only.', '@I24@', 240),
    (pg_temp.person(25), '11111111-1111-4111-8111-111111111111', 'female', false, 'public',  'Seamstress',
        'Her marriage to Frank Lindqvist was annulled in 1918.', '@I25@', 250);

-- ─── Names ──────────────────────────────────────────────────────────
-- Each person has one primary name. A married woman has her maiden name (not primary)
-- and her married name (primary) with the maiden surname kept as surname_at_birth.
insert into familee.person_names (person_id, type, is_primary, surname, given, patronymic, prefix, suffix, nickname, surname_at_birth, locale, notes) values
    (pg_temp.person(1), 'birth', true, 'Callahan', 'Thomas Michael', null, null, 'Sr.', null, null, 'en', null),
    (pg_temp.person(1), 'immigrant', false, 'Ó Callacháin', 'Tomás', null, null, null, null, null, 'ga',
        'The name as it was written in County Cork.'),

    (pg_temp.person(2), 'maiden', false, 'O''Brien', 'Margaret', null, null, null, null, null, 'en', null),
    (pg_temp.person(2), 'married', true, 'Callahan', 'Margaret Anne', null, null, null, null, 'O''Brien', 'en', null),
    (pg_temp.person(2), 'nickname', false, null, 'Margaret', null, null, null, 'Maggie', null, 'en', null),

    (pg_temp.person(3), 'birth', true, 'Callahan', 'James Thomas', null, null, 'Jr.', null, null, 'en', null),
    (pg_temp.person(3), 'nickname', false, null, 'James', null, null, null, 'Jim', null, 'en', null),

    (pg_temp.person(4), 'maiden', false, 'Callahan', 'Ruth Ann', null, null, null, null, null, 'en', null),
    (pg_temp.person(4), 'married', true, 'Lindqvist', 'Ruth Ann', null, null, null, null, 'Callahan', 'en', null),

    (pg_temp.person(5), 'birth', true, 'Lindqvist', 'Frank', null, null, null, null, null, 'en', null),
    (pg_temp.person(5), 'transliteration', false, 'Lindkvist', 'Frans', null, null, null, null, null, 'sv',
        'The Swedish spelling of the same name.'),

    (pg_temp.person(6), 'birth', true, 'Callahan', 'Robert Thomas', null, null, null, null, null, 'en', null),
    (pg_temp.person(6), 'nickname', false, null, 'Robert', null, null, null, 'Bob', null, 'en', null),

    (pg_temp.person(7), 'maiden', false, 'Shaw', 'Helen Marie', null, null, null, null, null, 'en', null),
    (pg_temp.person(7), 'married', true, 'Callahan', 'Helen Marie', null, null, null, null, 'Shaw', 'en', null),

    (pg_temp.person(8), 'maiden', false, 'Harper', 'June Louise', null, null, null, null, null, 'en', null),
    (pg_temp.person(8), 'married', true, 'Callahan', 'June Louise', null, null, null, null, 'Harper', 'en', null),

    (pg_temp.person(9), 'maiden', false, 'Fitch', 'Eleanor Rose', null, null, null, null, null, 'en', null),
    (pg_temp.person(9), 'married', true, 'Callahan', 'Eleanor Rose', null, null, null, null, 'Fitch', 'en', null),

    (pg_temp.person(10), 'maiden', false, 'Callahan', 'Dorothy Mae', null, null, null, null, null, 'en', null),
    (pg_temp.person(10), 'married', true, 'Brooks', 'Dorothy Mae', null, null, null, null, 'Callahan', 'en', null),

    (pg_temp.person(11), 'birth', true, 'Callahan', 'Richard Thomas', null, null, null, null, null, 'en', null),
    (pg_temp.person(12), 'birth', true, 'Lindqvist', 'Gene', null, null, null, null, null, 'en', null),
    (pg_temp.person(13), 'birth', true, 'Callahan', 'Joan Marie', null, null, null, null, null, 'en', null),
    (pg_temp.person(14), 'birth', true, 'Callahan', 'Walter Edward', null, null, null, null, null, 'en', null),
    (pg_temp.person(15), 'birth', true, 'Brooks', 'Alan Lee', null, null, null, null, null, 'en', null),
    (pg_temp.person(16), 'birth', true, 'Brooks', 'Lisa Anne', null, null, null, null, null, 'en', null),
    (pg_temp.person(17), 'birth', true, 'Mercer', 'Paul James', null, 'Dr.', null, null, null, 'en', null),

    (pg_temp.person(18), 'maiden', false, 'Lindqvist', 'Carol Ann', null, null, null, null, null, 'en', null),
    (pg_temp.person(18), 'married', true, 'Holt', 'Carol Ann', null, null, null, null, 'Lindqvist', 'en', null),

    (pg_temp.person(19), 'birth', true, 'Holt', 'Peter Alan', null, null, null, null, null, 'en', null),
    (pg_temp.person(20), 'birth', true, 'Holt', 'Anna Marie', null, null, null, null, null, 'en', null),
    (pg_temp.person(21), 'birth', true, 'Brooks', 'Owen Alan', null, null, null, null, null, 'en', null),
    (pg_temp.person(22), 'birth', true, 'Holt', 'Mia Rose', null, null, null, null, null, 'en', null),
    (pg_temp.person(23), 'birth', true, 'Okafor', 'Samuel Chidi', null, null, null, null, null, 'en', null),
    (pg_temp.person(23), 'nickname', false, null, 'Samuel', null, null, null, 'Sam', null, 'en', null),
    (pg_temp.person(24), 'birth', true, 'Holt', 'Riley', null, null, null, null, null, 'en', null),

    (pg_temp.person(25), 'birth', true, 'Dahl', 'Clara Ellen', null, null, null, null, null, 'en', null);

-- ─── Unions ─────────────────────────────────────────────────────────
insert into familee.families (id, tree_id, type, status, notes, gedcom_xref) values
    (pg_temp.family(1),  '11111111-1111-4111-8111-111111111111', 'marriage',     'widowed',  'Thomas died in 1931.', '@F1@'),
    (pg_temp.family(2),  '11111111-1111-4111-8111-111111111111', 'marriage',     'widowed',  null, '@F2@'),
    (pg_temp.family(3),  '11111111-1111-4111-8111-111111111111', 'single_parent', 'unknown', 'Joan was born before Ruth married Frank.', '@F3@'),
    (pg_temp.family(4),  '11111111-1111-4111-8111-111111111111', 'marriage',     'widowed',  'Gene was adopted in 1932.', '@F4@'),
    (pg_temp.family(5),  '11111111-1111-4111-8111-111111111111', 'marriage',     'annulled', 'Annulled in 1918; no children.', '@F5@'),
    (pg_temp.family(6),  '11111111-1111-4111-8111-111111111111', 'marriage',     'divorced', 'The first marriage of Robert.', '@F6@'),
    (pg_temp.family(7),  '11111111-1111-4111-8111-111111111111', 'marriage',     'widowed',  'June raised Walter from the age of eight.', '@F7@'),
    (pg_temp.family(8),  '11111111-1111-4111-8111-111111111111', 'marriage',     'widowed',  null, '@F8@'),
    (pg_temp.family(9),  '11111111-1111-4111-8111-111111111111', 'civil_union',  'widowed',  'Civil union registered in San Francisco.', '@F9@'),
    (pg_temp.family(10), '11111111-1111-4111-8111-111111111111', 'marriage',     'widowed',  null, '@F10@'),
    (pg_temp.family(11), '11111111-1111-4111-8111-111111111111', 'partnership',  'separated', 'Separated in 2019; they share custody of Mia''s daughter.', '@F11@'),
    (pg_temp.family(12), '11111111-1111-4111-8111-111111111111', 'single_parent', 'unknown', null, '@F12@'),
    (pg_temp.family(13), '11111111-1111-4111-8111-111111111111', 'unknown', 'unknown', null, '@F13@');

insert into familee.family_partners (tree_id, family_id, person_id, role, sort_order) values
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(1), pg_temp.person(1), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(1), pg_temp.person(2), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(2), pg_temp.person(3), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(2), pg_temp.person(9), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(3), pg_temp.person(4), 'partner', 0),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(4), pg_temp.person(5), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(4), pg_temp.person(4), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(5), pg_temp.person(5), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(5), pg_temp.person(25), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(6), pg_temp.person(6), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(6), pg_temp.person(7), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(7), pg_temp.person(6), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(7), pg_temp.person(8), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(8), pg_temp.person(15), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(8), pg_temp.person(10), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(9), pg_temp.person(11), 'partner', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(9), pg_temp.person(17), 'partner', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(10), pg_temp.person(19), 'husband', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(10), pg_temp.person(18), 'wife', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(11), pg_temp.person(20), 'partner', 0),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(11), pg_temp.person(23), 'partner', 1),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(12), pg_temp.person(22), 'partner', 0),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(13), pg_temp.person(16), 'partner', 0);

insert into familee.family_children (tree_id, family_id, person_id, relation, relation_by_partner, birth_order, notes) values
    -- The first generation's children
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(1), pg_temp.person(3), 'biological', '{}', 1, null),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(1), pg_temp.person(4), 'biological', '{}', 2, null),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(2), pg_temp.person(10), 'biological', '{}', 1, null),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(2), pg_temp.person(11), 'biological', '{}', 2, null),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(3), pg_temp.person(13), 'biological', '{}', 1, 'Born 1919, before the marriage.'),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(4), pg_temp.person(18), 'biological', '{}', 1, null),
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(4), pg_temp.person(12), 'adopted', '{}', 2, 'Adopted in 1932.'),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(6), pg_temp.person(14), 'biological', '{}', 1, null),

    -- June's stepson: Walter is her step, Bob is his biological father
    ('11111111-1111-4111-8111-111111111111', pg_temp.family(7), pg_temp.person(14), 'step',
        '{"22222222-0000-4000-8000-000000000006": "biological"}', 1, 'The stepmother who raised him.'),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(8), pg_temp.person(16), 'biological', '{}', 1, null),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(10), pg_temp.person(20), 'biological', '{}', 1, null),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(11), pg_temp.person(22), 'biological', '{}', 1, null),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(12), pg_temp.person(24), 'biological', '{}', 1, null),

    ('11111111-1111-4111-8111-111111111111', pg_temp.family(13), pg_temp.person(21), 'biological', '{}', 1, null);

-- ─── Events of people ───────────────────────────────────────────────
-- One row per fact. date_original is the date as the source writes it; the
-- qualifier, precision and start/end are what the application sorts and shows.
insert into familee.events (
    tree_id, type_code, person_id, place_id, value, description, age_text,
    date_qualifier, date_precision, date_start, date_end, date_original, is_primary
) values
    -- Thomas Michael Callahan
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(1), pg_temp.place(9), null, null, null,
        'exact', 'day', '1868-03-17', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'emigration', pg_temp.person(1), pg_temp.place(9), null,
        'Left Cork on a steamer for Liverpool.', null, 'between', 'year', '1888-01-01', '1889-12-31', 'between 1888 and 1889', true),
    ('11111111-1111-4111-8111-111111111111', 'immigration', pg_temp.person(1), pg_temp.place(6), null,
        'Recorded on the passenger manifest.', null, 'exact', 'day', '1889-05-02', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'naturalization', pg_temp.person(1), pg_temp.place(3), null, null, null,
        'exact', 'year', '1898-01-01', null, '1898', true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(1), pg_temp.place(3), 'steelworker', null, null,
        'from_to', 'year', '1890-01-01', '1931-01-01', '1890–1931', true),
    ('11111111-1111-4111-8111-111111111111', 'census', pg_temp.person(1), pg_temp.place(3), 'Ward 17', null, null,
        'exact', 'year', '1900-01-01', null, '1900', true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(1), pg_temp.place(3), null, null, '63 years',
        'exact', 'day', '1931-11-14', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'cause_of_death', pg_temp.person(1), pg_temp.place(3), 'Industrial accident', null, null,
        'exact', 'day', '1931-11-14', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(1), pg_temp.place(4), null, null, null,
        'exact', 'day', '1931-11-17', null, null, true),

    -- Margaret Callahan (née O'Brien)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(2), pg_temp.place(9), null, null, null,
        'about', 'year', '1872-01-01', null, 'about 1872', true),
    ('11111111-1111-4111-8111-111111111111', 'immigration', pg_temp.person(2), pg_temp.place(6), null, null, null,
        'exact', 'day', '1890-03-30', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(2), pg_temp.place(3), 'seamstress', null, null,
        'from_to', 'year', '1915-01-01', '1930-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(2), pg_temp.place(3), null, null, '77 years',
        'exact', 'day', '1950-02-03', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(2), pg_temp.place(4), null, null, null,
        'exact', 'day', '1950-02-06', null, null, true),

    -- James Thomas Callahan
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(3), pg_temp.place(3), null, null, null,
        'exact', 'day', '1897-08-08', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'education', pg_temp.person(3), pg_temp.place(3), 'High school diploma', null, null,
        'exact', 'year', '1915-01-01', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(3), pg_temp.place(3), 'machinist', null, null,
        'from_to', 'year', '1919-01-01', '1942-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'military_service', pg_temp.person(3), null, 'U.S. Army, infantry', null, null,
        'from_to', 'day', '1942-03-01', '1945-10-15', null, true),
    ('11111111-1111-4111-8111-111111111111', 'war_participation', pg_temp.person(3), pg_temp.place(11), 'Normandy campaign',
        'Landed on the coast with his company.', null, 'from_to', 'day', '1944-06-06', '1944-07-12', null, true),
    ('11111111-1111-4111-8111-111111111111', 'military_award', pg_temp.person(3), null, 'Bronze Star', null, null,
        'exact', 'year', '1944-01-01', null, '1944', true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(3), pg_temp.place(12), null,
        'Killed in action near the coast.', '46 years', 'exact', 'day', '1944-07-12', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(3), pg_temp.place(13), null, null, null,
        'exact', 'day', '1944-07-20', null, null, true),

    -- Ruth Ann Callahan
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(4), pg_temp.place(3), null, null, null,
        'exact', 'day', '1900-02-14', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'census', pg_temp.person(4), pg_temp.place(3), 'Ward 17', null, null,
        'exact', 'year', '1910-01-01', null, '1910', true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(4), pg_temp.place(3), 'telephone operator', null, null,
        'from_to', 'year', '1918-01-01', '1921-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(4), pg_temp.place(3), null, null, '90 years',
        'exact', 'day', '1990-09-22', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(4), pg_temp.place(4), null, null, null,
        'exact', 'day', '1990-09-26', null, null, true),

    -- Frank Lindqvist
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(5), pg_temp.place(24), null, null, null,
        'exact', 'day', '1896-11-02', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'immigration', pg_temp.person(5), pg_temp.place(6), null, null, null,
        'exact', 'day', '1914-08-10', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'naturalization', pg_temp.person(5), pg_temp.place(3), null, null, null,
        'before', 'year', '1925-01-01', null, 'before 1925', true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(5), pg_temp.place(3), 'carpenter', null, null,
        'from_to', 'year', '1920-01-01', '1960-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(5), pg_temp.place(3), null, null, '70 years',
        'exact', 'day', '1967-05-19', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(5), pg_temp.place(4), null, null, null,
        'exact', 'day', '1967-05-22', null, null, true),

    -- Robert "Bob" Callahan
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(6), pg_temp.place(3), null, null, null,
        'exact', 'day', '1904-10-30', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(6), pg_temp.place(15), 'carpenter and contractor', null, null,
        'from_to', 'year', '1929-01-01', '1981-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'residence', pg_temp.person(6), pg_temp.place(15), null,
        'The house on Ridge Road.', null, 'from_to', 'year', '1929-01-01', '1981-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(6), pg_temp.place(16), null, null, '76 years',
        'exact', 'day', '1981-03-08', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(6), pg_temp.place(17), null, null, null,
        'exact', 'day', '1981-03-11', null, null, true),

    -- Helen Shaw
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(7), pg_temp.place(15), null, null, null,
        'exact', 'day', '1906-06-12', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(7), pg_temp.place(15), 'bookkeeper', null, null,
        'from_to', 'year', '1925-01-01', '1928-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(7), pg_temp.place(15), null, null, '72 years',
        'exact', 'day', '1979-04-02', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(7), pg_temp.place(17), null, null, null,
        'exact', 'day', '1979-04-06', null, null, true),

    -- June Harper
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(8), pg_temp.place(15), null, null, null,
        'exact', 'day', '1915-07-24', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'education', pg_temp.person(8), pg_temp.place(15), 'Nursing school', null, null,
        'exact', 'year', '1933-01-01', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(8), pg_temp.place(16), 'nurse', null, null,
        'from_to', 'year', '1936-01-01', '1975-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(8), pg_temp.place(15), null, null, '85 years',
        'exact', 'day', '2001-02-18', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(8), pg_temp.place(17), null, null, null,
        'exact', 'day', '2001-02-22', null, null, true),

    -- Eleanor Rose Fitch
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(9), pg_temp.place(3), null, null, null,
        'exact', 'day', '1901-01-17', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(9), pg_temp.place(3), 'piano teacher', null, null,
        'from_to', 'year', '1922-01-01', '1940-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(9), pg_temp.place(3), null, null, '81 years',
        'exact', 'day', '1982-12-04', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(9), pg_temp.place(4), null, null, null,
        'exact', 'day', '1982-12-08', null, null, true),

    -- Dorothy Mae Brooks (née Callahan)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(10), pg_temp.place(3), null, null, null,
        'exact', 'day', '1923-01-22', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'education', pg_temp.person(10), pg_temp.place(3), 'B.A. in music', null, null,
        'exact', 'year', '1941-01-01', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(10), pg_temp.place(19), 'piano teacher', null, null,
        'from_to', 'year', '1948-01-01', '2000-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'residence', pg_temp.person(10), pg_temp.place(19), null, null, null,
        'from_to', 'year', '1948-01-01', '2010-04-09', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(10), pg_temp.place(19), null, null, '87 years',
        'exact', 'day', '2010-04-09', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(10), pg_temp.place(20), null, null, null,
        'exact', 'day', '2010-04-13', null, null, true),

    -- Richard Thomas Callahan
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(11), pg_temp.place(3), null, null, null,
        'exact', 'day', '1926-11-03', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'military_service', pg_temp.person(11), null, 'U.S. Navy', null, null,
        'from_to', 'day', '1944-07-01', '1946-06-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(11), pg_temp.place(19), 'architect', null, null,
        'from_to', 'year', '1955-01-01', '1990-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'award', pg_temp.person(11), pg_temp.place(19), 'Regional design award',
        'For a library building on the Embarcadero.', null, 'exact', 'year', '1978-01-01', null, '1978', true),
    ('11111111-1111-4111-8111-111111111111', 'residence', pg_temp.person(11), pg_temp.place(19), null, null, null,
        'from_to', 'year', '1955-01-01', '2015-08-30', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(11), pg_temp.place(19), null, null, '88 years',
        'exact', 'day', '2015-08-30', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(11), pg_temp.place(20), null, null, null,
        'exact', 'day', '2015-09-04', null, null, true),

    -- Gene Lindqvist
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(12), pg_temp.place(3), null, null, null,
        'exact', 'day', '1931-06-14', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'adoption', pg_temp.person(12), pg_temp.place(3), null,
        'Adopted by Ruth and Frank Lindqvist.', null, 'exact', 'day', '1932-02-01', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(12), pg_temp.place(3), 'bus driver', null, null,
        'from_to', 'year', '1950-01-01', '1990-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(12), pg_temp.place(3), null, null, '68 years',
        'exact', 'day', '1999-12-27', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(12), pg_temp.place(4), null, null, null,
        'exact', 'day', '2000-01-03', null, null, true),

    -- Joan Marie Callahan
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(13), pg_temp.place(3), null, null, null,
        'exact', 'day', '1919-01-22', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(13), pg_temp.place(3), 'switchboard operator', null, null,
        'from_to', 'year', '1940-01-01', '1960-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(13), pg_temp.place(3), null, null, null,
        'about', 'year', '2003-01-01', null, 'about 2003', true),

    -- Walter Edward Callahan
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(14), pg_temp.place(15), null, null, null,
        'exact', 'day', '1930-04-09', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'military_service', pg_temp.person(14), null, 'U.S. Army, Korea service', null, null,
        'from_to', 'day', '1950-01-01', '1952-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'education', pg_temp.person(14), pg_temp.place(15), 'Engineering degree', null, null,
        'exact', 'year', '1956-01-01', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(14), pg_temp.place(15), 'civil engineer', null, null,
        'from_to', 'year', '1956-01-01', '1995-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'residence', pg_temp.person(14), pg_temp.place(15), null, null, null,
        'from_to', 'year', '1956-01-01', '2012-10-17', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(14), pg_temp.place(15), null, null, '82 years',
        'exact', 'day', '2012-10-17', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(14), pg_temp.place(17), null, null, null,
        'exact', 'day', '2012-10-21', null, null, true),

    -- Alan Lee Brooks
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(15), pg_temp.place(22), null, null, null,
        'exact', 'day', '1921-02-18', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(15), pg_temp.place(19), 'insurance agent', null, null,
        'from_to', 'year', '1946-01-01', '1980-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(15), pg_temp.place(19), null, null, '77 years',
        'exact', 'day', '1998-06-30', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(15), pg_temp.place(20), null, null, null,
        'exact', 'day', '1998-07-03', null, null, true),

    -- Lisa Anne Brooks (living)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(16), pg_temp.place(19), null, null, null,
        'exact', 'day', '1950-03-12', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(16), pg_temp.place(19), 'journalist', null, null,
        'exact', 'year', '1975-01-01', null, '1975', true),

    -- Paul James Mercer (living)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(17), pg_temp.place(19), null, null, null,
        'exact', 'day', '1952-07-07', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(17), pg_temp.place(19), 'physician', null, null,
        'estimated', 'year', '1980-01-01', null, 'c. 1980', true),

    -- Carol Ann Holt (née Lindqvist)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(18), pg_temp.place(3), null, null, null,
        'exact', 'day', '1925-09-03', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'education', pg_temp.person(18), pg_temp.place(15), 'Teaching certificate', null, null,
        'exact', 'year', '1946-01-01', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(18), pg_temp.place(15), 'teacher', null, null,
        'from_to', 'year', '1948-01-01', '1985-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(18), pg_temp.place(15), null, null, '92 years',
        'exact', 'day', '2018-03-14', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(18), pg_temp.place(17), null, null, null,
        'exact', 'day', '2018-03-18', null, null, true),

    -- Peter Alan Holt
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(19), pg_temp.place(15), null, null, null,
        'exact', 'day', '1923-05-22', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'military_service', pg_temp.person(19), pg_temp.place(15), 'U.S. Navy', null, null,
        'from_to', 'day', '1943-01-01', '1946-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(19), pg_temp.place(15), 'pharmacist', null, null,
        'from_to', 'year', '1948-01-01', '1988-01-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(19), pg_temp.place(15), null, null, '77 years',
        'exact', 'day', '2000-11-02', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(19), pg_temp.place(17), null, null, null,
        'exact', 'day', '2000-11-06', null, null, true),

    -- Anna Marie Holt (living)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(20), pg_temp.place(15), null, null, null,
        'exact', 'day', '1953-01-27', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'education', pg_temp.person(20), pg_temp.place(15), 'Bachelor of Arts', null, null,
        'exact', 'year', '1975-01-01', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(20), pg_temp.place(19), 'librarian', null, null,
        'exact', 'year', '1982-01-01', null, '1982', true),

    -- Owen Alan Brooks (living)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(21), pg_temp.place(19), null, null, null,
        'exact', 'day', '1978-10-02', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(21), pg_temp.place(19), 'software engineer', null, null,
        'exact', 'year', '2005-01-01', null, '2005', true),

    -- Mia Rose Holt (living)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(22), pg_temp.place(19), null, null, null,
        'exact', 'day', '1982-04-19', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'education', pg_temp.person(22), pg_temp.place(19), 'Master of Public Health', null, null,
        'exact', 'year', '2004-01-01', null, null, true),

    -- Samuel Chidi Okafor (living)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(23), pg_temp.place(19), null, null, null,
        'exact', 'day', '1950-09-09', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(23), pg_temp.place(19), 'contractor', null, null,
        'exact', 'year', '1995-01-01', null, '1995', true),

    -- Riley Holt (living, private)
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(24), pg_temp.place(19), null, null, null,
        'exact', 'day', '2016-06-05', null, null, true),

    -- Clara Ellen Dahl
    ('11111111-1111-4111-8111-111111111111', 'birth', pg_temp.person(25), pg_temp.place(3), null, null, null,
        'calculated', 'year', '1894-01-01', null, 'calculated from the 1900 census', true),
    ('11111111-1111-4111-8111-111111111111', 'occupation', pg_temp.person(25), pg_temp.place(3), 'seamstress', null, null,
        'exact', 'decade', '1910-01-01', null, '1910s', true),
    ('11111111-1111-4111-8111-111111111111', 'death', pg_temp.person(25), pg_temp.place(3), null, null, '66 years',
        'exact', 'day', '1960-10-20', null, null, true),
    ('11111111-1111-4111-8111-111111111111', 'burial', pg_temp.person(25), pg_temp.place(4), null, null, null,
        'exact', 'day', '1960-10-24', null, null, true);

-- ─── Events of unions ───────────────────────────────────────────────
insert into familee.events (
    tree_id, type_code, family_id, place_id, description,
    date_qualifier, date_precision, date_start, date_original, is_primary
) values
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(1), pg_temp.place(5), 'Married at St. Patrick''s.',
        'exact', 'day', '1890-06-02', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(2), pg_temp.place(3), null,
        'exact', 'day', '1920-06-12', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(4), pg_temp.place(3), null,
        'exact', 'day', '1921-04-30', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(5), pg_temp.place(3), null,
        'exact', 'day', '1917-10-01', null, true),
    ('11111111-1111-4111-8111-111111111111', 'annulment', pg_temp.family(5), pg_temp.place(3), 'Annulled by the diocese.',
        'exact', 'day', '1918-02-11', null, true),
    ('11111111-1111-4111-8111-111111111111', 'engagement', pg_temp.family(6), pg_temp.place(15), null,
        'exact', 'day', '1928-03-02', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(6), pg_temp.place(15), null,
        'exact', 'day', '1928-05-19', null, true),
    ('11111111-1111-4111-8111-111111111111', 'divorce_filed', pg_temp.family(6), pg_temp.place(15), null,
        'exact', 'day', '1936-01-14', null, true),
    ('11111111-1111-4111-8111-111111111111', 'divorce', pg_temp.family(6), pg_temp.place(15), null,
        'exact', 'day', '1936-03-20', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(7), pg_temp.place(15), null,
        'exact', 'day', '1938-09-03', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(8), pg_temp.place(19), null,
        'exact', 'day', '1948-07-17', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(9), pg_temp.place(19), 'Civil union registered in San Francisco.',
        'exact', 'day', '2010-06-05', null, true),
    ('11111111-1111-4111-8111-111111111111', 'marriage', pg_temp.family(10), pg_temp.place(15), null,
        'exact', 'day', '1948-02-14', null, true),
    ('11111111-1111-4111-8111-111111111111', 'separation', pg_temp.family(11), pg_temp.place(19), 'Separated; they co-parent Mia''s daughter.',
        'exact', 'day', '2019-08-02', null, true);

-- ─── Citations: a source used for a person, a union or an event ─────
-- Each citation has exactly one target (citations_target_xor). The events are looked
-- up by their person and their type, so the seed does not need identifiers for them.
insert into familee.citations (source_id, person_id, family_id, event_id, page, quality, date_original, text_excerpt)
select pg_temp.source(1), pg_temp.person(1), null::uuid, null::uuid, 'Sheet 14', 3, '1900',
       'Thomas Callahan, 31, steelworker, born in Ireland.'
union all
select pg_temp.source(2), null::uuid, null::uuid, e.id, 'Line 18', 3, '1889',
       'Callahan, Thomas, 21, laborer, from Ireland.'
  from familee.events e
 where e.tree_id = '11111111-1111-4111-8111-111111111111' and e.person_id = pg_temp.person(1) and e.type_code = 'immigration'
union all
select pg_temp.source(3), pg_temp.person(3), null::uuid, null::uuid, 'Inside cover', 2, '1897',
       'James Thomas, born August 8, 1897.'
union all
select pg_temp.source(4), null::uuid, null::uuid, e.id, 'Page 1', 3, '1944',
       'Unit and campaign as recorded at discharge.'
  from familee.events e
 where e.tree_id = '11111111-1111-4111-8111-111111111111' and e.person_id = pg_temp.person(3) and e.type_code = 'war_participation'
union all
select pg_temp.source(5), null::uuid, pg_temp.family(1), null::uuid, 'Book 4, page 88', 3, '1890',
       'Married 2 June 1890 at St. Patrick''s Church.'
union all
select pg_temp.source(5), pg_temp.person(2), null::uuid, null::uuid, 'Book 4, page 88', 3, '1890',
       'Margaret O''Brien, bride.'
union all
select pg_temp.source(6), pg_temp.person(12), null::uuid, null::uuid, 'Tape 1', 1, '2009',
       'Gene was told as a boy that he had been adopted as a baby.'
union all
select pg_temp.source(7), null::uuid, null::uuid, e.id, 'Volume 23', 3, '1981',
       'Died at Mercy Hospital, Cleveland.'
  from familee.events e
 where e.tree_id = '11111111-1111-4111-8111-111111111111' and e.person_id = pg_temp.person(6) and e.type_code = 'death';

-- ─── Notes and stories ──────────────────────────────────────────────
-- A note can be about a person, a union, an event, a place, a source or a photograph.
insert into familee.notes (tree_id, title, body, person_id, family_id, event_id, place_id, source_id) values
    ('11111111-1111-4111-8111-111111111111', 'The mill whistle',
        'Thomas walked to the mill before the whistle every morning. His children remember the sound more than his face.',
        pg_temp.person(1), null, null, null, null),
    ('11111111-1111-4111-8111-111111111111', 'The house on Ridge Road',
        'Bob built the house in 1929 with his own hands. The porch still has his initials cut into the post.',
        null, null, null, pg_temp.place(15), null),
    ('11111111-1111-4111-8111-111111111111', 'Reading the Bible',
        'The inside cover lists births and marriages in three different inks. Where the ink changes, the family changed.',
        null, null, null, null, pg_temp.source(3)),
    ('11111111-1111-4111-8111-111111111111', 'The adoption',
        'Ruth and Frank adopted Gene in 1932. The papers are in the county archive.',
        null, pg_temp.family(4), null, null, null),
    ('11111111-1111-4111-8111-111111111111', 'The last letter',
        'Three letters came after the landing. The last one was written in pencil, on the back of a map.',
        null, null, (select e.id from familee.events e
                      where e.tree_id = '11111111-1111-4111-8111-111111111111'
                        and e.person_id = pg_temp.person(3) and e.type_code = 'death'),
        null, null),
    ('11111111-1111-4111-8111-111111111111', 'The interview',
        'Walter spoke for two hours in 2009. He asked to be heard about the engineering work, not the war.',
        pg_temp.person(14), null, null, null, null);

commit;

-- ─── What came out of it ────────────────────────────────────────────
select 'persons' as entity, count(*) as amount from familee.persons
 where tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'names', count(*) from familee.person_names n
  join familee.persons p on p.id = n.person_id
 where p.tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'unions', count(*) from familee.families
 where tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'parent-child links', count(*) from familee.parent_child
 where tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'events', count(*) from familee.events
 where tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'places', count(*) from familee.places
 where tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'sources', count(*) from familee.sources
 where tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'citations', count(*) from familee.citations c
  join familee.sources s on s.id = c.source_id
 where s.tree_id = '11111111-1111-4111-8111-111111111111'
union all
select 'notes', count(*) from familee.notes
 where tree_id = '11111111-1111-4111-8111-111111111111';
