-- =====================================================================
--  Familee - 0002_reference_data
--
--  The event type dictionary. The codes follow the GEDCOM 5.5.1 / 7.0
--  standard, so import and export need no mapping table: gedcom_tag is
--  stored next to the code.
--
--  The table holds no interface labels. The application takes the name
--  of an event from the key events.<code> in messages/<locale>.json;
--  label_fallback is used only when none of the installed languages has
--  a translation. Adding a language requires no migration.
--
--  Re-running this file refreshes the metadata of the built-in types and
--  leaves user-added types (is_custom = true) alone.
-- =====================================================================

begin;

set local search_path = familee, public;

insert into familee.event_types
    (code, applies_to, has_value, is_vital, gedcom_tag, sort_order, is_custom, label_fallback)
values
    -- ---------------------------------------------------------------
    --  Person events: the beginning of a life
    -- ---------------------------------------------------------------
    ('birth',                 'person', false, true,  'BIRT',  10, false, 'Birth'),
    ('christening',           'person', false, false, 'CHR',   20, false, 'Christening'),
    ('baptism',               'person', false, false, 'BAPM',  21, false, 'Baptism (adult)'),
    ('blessing',              'person', false, false, 'BLES',  22, false, 'Blessing'),
    ('circumcision',          'person', false, false, 'EVEN',  23, false, 'Circumcision'),
    ('adoption',              'person', false, true,  'ADOP',  30, false, 'Adoption'),
    ('naming',                'person', true,  false, 'EVEN',  35, false, 'Naming'),

    -- ---------------------------------------------------------------
    --  Person events: coming of age and faith
    -- ---------------------------------------------------------------
    ('bar_mitzvah',           'person', false, false, 'BARM',  40, false, 'Bar mitzvah'),
    ('bas_mitzvah',           'person', false, false, 'BASM',  41, false, 'Bat mitzvah'),
    ('first_communion',       'person', false, false, 'FCOM',  42, false, 'First communion'),
    ('confirmation',          'person', false, false, 'CONF',  43, false, 'Confirmation'),
    ('ordination',            'person', true,  false, 'ORDN',  44, false, 'Ordination'),

    -- ---------------------------------------------------------------
    --  Person events: education and service
    -- ---------------------------------------------------------------
    ('graduation',            'person', true,  false, 'GRAD', 120, false, 'Graduation'),
    ('military_service',      'person', true,  false, 'EVEN', 130, false, 'Military service'),
    ('military_award',        'person', true,  false, 'EVEN', 131, false, 'Military award'),
    ('war_participation',     'person', true,  false, 'EVEN', 132, false, 'War participation'),
    ('missing_in_action',     'person', false, false, 'EVEN', 133, false, 'Missing in action'),
    ('captivity',             'person', true,  false, 'EVEN', 134, false, 'Captivity'),
    ('retirement',            'person', false, false, 'RETI', 140, false, 'Retirement'),

    -- ---------------------------------------------------------------
    --  Person events: movement and the state
    -- ---------------------------------------------------------------
    ('emigration',            'person', false, false, 'EMIG', 150, false, 'Emigration'),
    ('immigration',           'person', false, false, 'IMMI', 151, false, 'Immigration'),
    ('naturalization',        'person', false, false, 'NATU', 152, false, 'Naturalization'),
    ('deportation',           'person', true,  false, 'EVEN', 153, false, 'Deportation'),
    ('repression',            'person', true,  false, 'EVEN', 160, false, 'Political repression'),
    ('rehabilitation',        'person', true,  false, 'EVEN', 161, false, 'Rehabilitation'),
    ('name_change',           'person', true,  false, 'EVEN', 170, false, 'Name change'),
    ('award',                 'person', true,  false, 'EVEN', 180, false, 'Award'),

    -- ---------------------------------------------------------------
    --  Person attributes: these carry a text value
    -- ---------------------------------------------------------------
    ('occupation',            'person', true,  false, 'OCCU', 500, false, 'Occupation'),
    ('education',             'person', true,  false, 'EDUC', 501, false, 'Education'),
    ('title',                 'person', true,  false, 'TITL', 502, false, 'Title or rank'),
    ('nationality',           'person', true,  false, 'NATI', 503, false, 'Nationality'),
    ('religion',              'person', true,  false, 'RELI', 504, false, 'Religion'),
    ('caste',                 'person', true,  false, 'CAST', 505, false, 'Caste or estate'),
    ('property',              'person', true,  false, 'PROP', 506, false, 'Property'),
    ('physical_description',  'person', true,  false, 'DSCR', 507, false, 'Physical description'),
    ('national_id',           'person', true,  false, 'IDNO', 508, false, 'Identity document'),
    ('social_security',       'person', true,  false, 'SSN',  509, false, 'Social security number'),
    ('marriages_count',       'person', true,  false, 'NMR',  510, false, 'Number of marriages'),
    ('fact',                  'person', true,  false, 'FACT', 590, false, 'Fact'),

    -- ---------------------------------------------------------------
    --  Applicable to a person and to a union alike
    -- ---------------------------------------------------------------
    ('residence',             'both',   true,  false, 'RESI', 300, false, 'Residence'),
    ('census',                'both',   true,  false, 'CENS', 310, false, 'Census'),
    ('children_count',        'both',   true,  false, 'NCHI', 520, false, 'Number of children'),
    ('event',                 'both',   true,  false, 'EVEN', 600, false, 'Event'),

    -- ---------------------------------------------------------------
    --  Union events
    -- ---------------------------------------------------------------
    ('engagement',            'family', false, false, 'ENGA', 200, false, 'Engagement'),
    ('marriage_bann',         'family', false, false, 'MARB', 201, false, 'Marriage banns'),
    ('marriage_contract',     'family', false, false, 'MARC', 202, false, 'Marriage contract'),
    ('marriage_license',      'family', false, false, 'MARL', 203, false, 'Marriage license'),
    ('marriage_settlement',   'family', false, false, 'MARS', 204, false, 'Marriage settlement'),
    ('marriage',              'family', false, true,  'MARR', 210, false, 'Marriage'),
    ('separation',            'family', false, false, 'EVEN', 220, false, 'Separation'),
    ('divorce_filed',         'family', false, false, 'DIVF', 230, false, 'Divorce filed'),
    ('divorce',               'family', false, true,  'DIV',  231, false, 'Divorce'),
    ('annulment',             'family', false, true,  'ANUL', 232, false, 'Annulment'),

    -- ---------------------------------------------------------------
    --  Person events: the end of a life and the papers after it
    -- ---------------------------------------------------------------
    ('death',                 'person', false, true,  'DEAT', 900, false, 'Death'),
    ('burial',                'person', false, true,  'BURI', 910, false, 'Burial'),
    ('cremation',             'person', false, false, 'CREM', 911, false, 'Cremation'),
    ('reburial',              'person', false, false, 'EVEN', 912, false, 'Reburial'),
    ('cause_of_death',        'person', true,  false, 'EVEN', 913, false, 'Cause of death'),
    ('probate',               'person', false, false, 'PROB', 920, false, 'Probate'),
    ('will',                  'person', false, false, 'WILL', 921, false, 'Will')

on conflict (code) do update set
    applies_to     = excluded.applies_to,
    has_value      = excluded.has_value,
    is_vital       = excluded.is_vital,
    gedcom_tag     = excluded.gedcom_tag,
    sort_order     = excluded.sort_order,
    label_fallback = excluded.label_fallback
where event_types.is_custom = false;


insert into familee.schema_migrations (version)
values ('0002_reference_data')
on conflict do nothing;

commit;
