/**
 * Familee - reading places, sources, citations, notes and the search over the archive
 *
 * Not a server action: called from server components after the caller's access to the tree has
 * been checked. Every query is limited to one tree.
 */

import {
    type AnyColumn,
    and,
    asc,
    desc,
    eq,
    ilike,
    inArray,
    isNotNull,
    not,
    or,
    sql,
} from "drizzle-orm";

import { db, schema } from "@/db";
import { groupByText } from "@/lib/duplicates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A place of this tree, or null. Both the events of a person and the events of a union link a
 * place, and neither may link one of another tree; the answer is the identifier to store.
 */
export async function findPlaceInTree(
    treeId: string,
    placeId: string | null,
): Promise<string | null> {
    if (!placeId || !UUID.test(placeId)) return null;
    const [place] = await db
        .select({ id: schema.places.id })
        .from(schema.places)
        .where(and(eq(schema.places.id, placeId), eq(schema.places.treeId, treeId)))
        .limit(1);
    return place?.id ?? null;
}

export async function listPlaces(treeId: string) {
    return db
        .select({
            id: schema.places.id,
            name: schema.places.name,
            kind: schema.places.kind,
            parentId: schema.places.parentId,
            fullName: schema.places.fullName,
            notes: schema.places.notes,
            latitude: schema.places.latitude,
            longitude: schema.places.longitude,
        })
        .from(schema.places)
        .where(eq(schema.places.treeId, treeId))
        .orderBy(asc(schema.places.name));
}

/** The places of a tree that carry coordinates, for the map. */
export async function listGeoPlaces(treeId: string) {
    const rows = await db
        .select({
            id: schema.places.id,
            name: schema.places.name,
            kind: schema.places.kind,
            fullName: schema.places.fullName,
            latitude: schema.places.latitude,
            longitude: schema.places.longitude,
        })
        .from(schema.places)
        .where(
            and(
                eq(schema.places.treeId, treeId),
                isNotNull(schema.places.latitude),
                isNotNull(schema.places.longitude),
            ),
        )
        .orderBy(asc(schema.places.name));

    return rows.flatMap((row) =>
        row.latitude === null || row.longitude === null
            ? []
            : [{ ...row, latitude: row.latitude, longitude: row.longitude }],
    );
}

/** A stop on a life's road: an event, its day and the place it happened in. */
export type JourneyStop = {
    eventId: string;
    typeCode: string;
    value: string | null;
    dateStart: string | null;
    datePrecision: string | null;
    placeId: string;
    placeName: string;
    latitude: number;
    longitude: number;
};

/**
 * The events of one person that happened in a place with coordinates, oldest first. This is the road
 * the life walked, and the line the map draws.
 */
export async function listPersonJourney(treeId: string, personId: string): Promise<JourneyStop[]> {
    const rows = await db
        .select({
            eventId: schema.events.id,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            dateStart: schema.events.dateStart,
            datePrecision: schema.events.datePrecision,
            placeId: schema.places.id,
            placeName: schema.places.name,
            latitude: schema.places.latitude,
            longitude: schema.places.longitude,
        })
        .from(schema.events)
        .innerJoin(schema.places, eq(schema.places.id, schema.events.placeId))
        .where(
            and(
                eq(schema.events.treeId, treeId),
                eq(schema.events.personId, personId),
                isNotNull(schema.places.latitude),
                isNotNull(schema.places.longitude),
            ),
        )
        .orderBy(asc(schema.events.sortDate), asc(schema.events.createdAt));

    return rows.flatMap((row) =>
        row.latitude === null || row.longitude === null
            ? []
            : [{ ...row, latitude: row.latitude, longitude: row.longitude }],
    );
}

/** The people whose life can be drawn on the map: those with an event in a located place. */
export async function listJourneyPersons(
    treeId: string,
): Promise<{ personId: string; name: string | null }[]> {
    const rows = await db
        .select({
            personId: schema.events.personId,
            name: schema.personCards.fullName,
        })
        .from(schema.events)
        .innerJoin(schema.places, eq(schema.places.id, schema.events.placeId))
        .innerJoin(schema.personCards, eq(schema.personCards.personId, schema.events.personId))
        .where(
            and(
                eq(schema.events.treeId, treeId),
                isNotNull(schema.events.personId),
                isNotNull(schema.places.latitude),
                isNotNull(schema.places.longitude),
            ),
        )
        .groupBy(schema.events.personId, schema.personCards.fullName)
        .orderBy(asc(schema.personCards.fullName));
    return rows.flatMap((row) =>
        row.personId ? [{ personId: row.personId, name: row.name }] : [],
    );
}

export async function listSources(treeId: string) {
    return db
        .select({
            id: schema.sources.id,
            title: schema.sources.title,
            author: schema.sources.author,
            publication: schema.sources.publication,
            url: schema.sources.url,
            textExcerpt: schema.sources.textExcerpt,
        })
        .from(schema.sources)
        .where(eq(schema.sources.treeId, treeId))
        .orderBy(asc(schema.sources.title));
}

export type PlaceDuplicate = {
    id: string;
    name: string;
    fullName: string | null;
    kind: string;
    notes: string | null;
    /** How much points at this place: the events, the media, the links, the notes, the children. */
    uses: number;
};

export type SourceDuplicate = {
    id: string;
    title: string;
    author: string | null;
    publication: string | null;
    callNumber: string | null;
    /** How much points at this source: the citations, the media links and the notes. */
    uses: number;
};

/**
 * The places of a tree that carry the same name, in groups of two or more, the biggest group first.
 * Nothing is decided here: the page shows the groups and the reader keeps the record that is right.
 */
export async function listPlaceDuplicates(treeId: string): Promise<PlaceDuplicate[][]> {
    const rows = await db
        .select({
            id: schema.places.id,
            name: schema.places.name,
            fullName: schema.places.fullName,
            kind: schema.places.kind,
            notes: schema.places.notes,
            uses: sql<string>`(
                (select count(*) from ${schema.events} e where e.place_id = ${schema.places.id})
                + (select count(*) from ${schema.media} m where m.place_id = ${schema.places.id})
                + (select count(*) from ${schema.mediaLinks} ml where ml.place_id = ${schema.places.id})
                + (select count(*) from ${schema.notes} n where n.place_id = ${schema.places.id})
                + (select count(*) from ${schema.places} c where c.parent_id = ${schema.places.id})
            )`,
        })
        .from(schema.places)
        .where(eq(schema.places.treeId, treeId));

    const places: PlaceDuplicate[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        fullName: row.fullName,
        kind: row.kind,
        notes: row.notes,
        uses: Number(row.uses),
    }));
    return groupByText(places, (place) => place.name);
}

/** The sources of a tree whose title is written the same way, in groups of two or more. */
export async function listSourceDuplicates(treeId: string): Promise<SourceDuplicate[][]> {
    const rows = await db
        .select({
            id: schema.sources.id,
            title: schema.sources.title,
            author: schema.sources.author,
            publication: schema.sources.publication,
            callNumber: schema.sources.callNumber,
            uses: sql<string>`(
                (select count(*) from ${schema.citations} c where c.source_id = ${schema.sources.id})
                + (select count(*) from ${schema.mediaLinks} ml where ml.source_id = ${schema.sources.id})
                + (select count(*) from ${schema.notes} n where n.source_id = ${schema.sources.id})
            )`,
        })
        .from(schema.sources)
        .where(eq(schema.sources.treeId, treeId));

    const sources: SourceDuplicate[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        publication: row.publication,
        callNumber: row.callNumber,
        uses: Number(row.uses),
    }));
    return groupByText(sources, (source) => source.title);
}

/** The sources a person is cited for: the citation's page and the source's title. */ export async function listPersonCitations(
    treeId: string,
    personId: string,
) {
    return db
        .select({
            id: schema.citations.id,
            sourceId: schema.sources.id,
            sourceTitle: schema.sources.title,
            page: schema.citations.page,
            textExcerpt: schema.citations.textExcerpt,
        })
        .from(schema.citations)
        .innerJoin(schema.sources, eq(schema.sources.id, schema.citations.sourceId))
        .where(and(eq(schema.citations.personId, personId), eq(schema.sources.treeId, treeId)))
        .orderBy(asc(schema.sources.title));
}

export type EventCitation = {
    id: string;
    sourceId: string;
    sourceTitle: string;
    page: string | null;
    textExcerpt: string | null;
};

/**
 * The citations of the given events, grouped by event id. The events are the person's own, so
 * the caller has already checked them; the source must still be in the tree.
 */
export async function listEventCitations(
    treeId: string,
    eventIds: string[],
): Promise<Map<string, EventCitation[]>> {
    const grouped = new Map<string, EventCitation[]>();
    if (eventIds.length === 0) return grouped;
    const rows = await db
        .select({
            id: schema.citations.id,
            eventId: schema.citations.eventId,
            sourceId: schema.sources.id,
            sourceTitle: schema.sources.title,
            page: schema.citations.page,
            textExcerpt: schema.citations.textExcerpt,
        })
        .from(schema.citations)
        .innerJoin(schema.sources, eq(schema.sources.id, schema.citations.sourceId))
        .where(and(inArray(schema.citations.eventId, eventIds), eq(schema.sources.treeId, treeId)))
        .orderBy(asc(schema.sources.title));
    for (const row of rows) {
        if (!row.eventId) continue;
        const list = grouped.get(row.eventId) ?? [];
        list.push({
            id: row.id,
            sourceId: row.sourceId,
            sourceTitle: row.sourceTitle,
            page: row.page,
            textExcerpt: row.textExcerpt,
        });
        grouped.set(row.eventId, list);
    }
    return grouped;
}

/** The notes and stories written about a person, newest first. */
export async function listPersonNotes(treeId: string, personId: string) {
    return db
        .select({
            id: schema.notes.id,
            title: schema.notes.title,
            body: schema.notes.body,
            updatedAt: schema.notes.updatedAt,
        })
        .from(schema.notes)
        .where(and(eq(schema.notes.personId, personId), eq(schema.notes.treeId, treeId)))
        .orderBy(desc(schema.notes.updatedAt));
}

/**
 * True when the person the column points to is in the trash. A null column is not (the row belongs
 * to no person), so "not inTrash" keeps the notes, events and photographs that are tied to nobody.
 * The person page of a trashed person answers 404, so a hit that leads there must not be listed.
 */
function inTrash(personId: AnyColumn) {
    return sql`exists (select 1 from ${schema.persons} where ${schema.persons.id} = ${personId} and ${schema.persons.deletedAt} is not null)`;
}

export type SearchHit = {
    kind: "person" | "place" | "source" | "note" | "event" | "photo";
    id: string;
    /** The person a hit belongs to, for events and notes (the link goes there). */
    personId: string | null;
    title: string;
    detail: string;
};

/**
 * The search over the whole archive: people by name, places by name, sources by title and author,
 * notes and stories by their text, events by their value and description, and photographs by what is
 * written under them, their own title and the name of the file. The query is matched anywhere in the
 * text, case-insensitively, and limited to the tree.
 */
export async function searchTree(treeId: string, query: string): Promise<SearchHit[]> {
    const needle = query.trim();
    if (needle.length < 2) return [];
    const pattern = `%${needle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const limit = 30;

    const people = await db
        .select({
            personId: schema.personCards.personId,
            name: schema.personCards.fullName,
            birthYear: schema.personCards.birthYear,
        })
        .from(schema.personCards)
        .where(
            and(eq(schema.personCards.treeId, treeId), ilike(schema.personCards.fullName, pattern)),
        )
        .limit(limit);

    const places = await db
        .select({
            id: schema.places.id,
            name: schema.places.name,
            fullName: schema.places.fullName,
        })
        .from(schema.places)
        .where(
            and(
                eq(schema.places.treeId, treeId),
                or(ilike(schema.places.name, pattern), ilike(schema.places.fullName, pattern)),
            ),
        )
        .limit(limit);

    const sources = await db
        .select({
            id: schema.sources.id,
            title: schema.sources.title,
            author: schema.sources.author,
        })
        .from(schema.sources)
        .where(
            and(
                eq(schema.sources.treeId, treeId),
                or(ilike(schema.sources.title, pattern), ilike(schema.sources.author, pattern)),
            ),
        )
        .limit(limit);

    const notes = await db
        .select({
            id: schema.notes.id,
            title: schema.notes.title,
            body: schema.notes.body,
            personId: schema.notes.personId,
        })
        .from(schema.notes)
        .where(
            and(
                eq(schema.notes.treeId, treeId),
                not(inTrash(schema.notes.personId)),
                or(ilike(schema.notes.title, pattern), ilike(schema.notes.body, pattern)),
            ),
        )
        .limit(limit);

    const events = await db
        .select({
            id: schema.events.id,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            description: schema.events.description,
            personId: schema.events.personId,
        })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.treeId, treeId),
                not(inTrash(schema.events.personId)),
                or(ilike(schema.events.value, pattern), ilike(schema.events.description, pattern)),
            ),
        )
        .limit(limit);

    // A photograph is found by its caption, by its own title and description, and by the name of
    // the file it came from: after an import that name is often the only text a picture carries.
    const photos = await db
        .select({
            mediaId: schema.media.id,
            title: schema.media.title,
            description: schema.media.description,
            originalFilename: schema.media.originalFilename,
            takenStart: schema.media.takenStart,
            caption: schema.mediaLinks.caption,
            personId: schema.mediaLinks.personId,
            eventPersonId: schema.events.personId,
        })
        .from(schema.media)
        .leftJoin(schema.mediaLinks, eq(schema.mediaLinks.mediaId, schema.media.id))
        .leftJoin(schema.events, eq(schema.events.id, schema.mediaLinks.eventId))
        .where(
            and(
                eq(schema.media.treeId, treeId),
                not(inTrash(schema.mediaLinks.personId)),
                not(inTrash(schema.events.personId)),
                or(
                    ilike(schema.media.title, pattern),
                    ilike(schema.media.description, pattern),
                    ilike(schema.media.originalFilename, pattern),
                    ilike(schema.mediaLinks.caption, pattern),
                ),
            ),
        )
        .limit(limit);

    const hits: SearchHit[] = [];
    for (const person of people) {
        hits.push({
            kind: "person",
            id: person.personId,
            personId: person.personId,
            title: person.name ?? "",
            detail: person.birthYear ? String(person.birthYear) : "",
        });
    }
    for (const place of places) {
        hits.push({
            kind: "place",
            id: place.id,
            personId: null,
            title: place.name,
            detail: place.fullName ?? "",
        });
    }
    for (const source of sources) {
        hits.push({
            kind: "source",
            id: source.id,
            personId: null,
            title: source.title,
            detail: source.author ?? "",
        });
    }
    for (const note of notes) {
        hits.push({
            kind: "note",
            id: note.id,
            personId: note.personId,
            title: note.title ?? "",
            detail: note.body.slice(0, 120),
        });
    }
    for (const event of events) {
        hits.push({
            kind: "event",
            id: event.id,
            personId: event.personId,
            title: event.typeCode,
            detail: event.value ?? event.description ?? "",
        });
    }

    // One photograph can be in several albums, and a search must not list the same picture twice.
    const photoHits = new Map<string, SearchHit>();
    for (const photo of photos) {
        const title = photo.title ?? photo.caption ?? photo.originalFilename ?? "";
        const detail = photo.description ?? photo.takenStart ?? "";
        const owner = photo.personId ?? photo.eventPersonId ?? null;
        const hit = photoHits.get(photo.mediaId);
        if (!hit) {
            photoHits.set(photo.mediaId, {
                kind: "photo",
                id: photo.mediaId,
                personId: owner,
                title,
                detail,
            });
            continue;
        }
        if (!hit.title && title) hit.title = title;
        if (!hit.detail && detail) hit.detail = detail;
        if (!hit.personId && owner) hit.personId = owner;
    }
    hits.push(...photoHits.values());
    return hits;
}

/** Where a hit of the search leads. The language prefix is added by the link that uses it. */
export function searchHitHref(slug: string, hit: SearchHit): string {
    if (hit.kind === "person") return `/trees/${slug}/persons/${hit.id}`;
    if (hit.kind === "photo") {
        return hit.personId ? `/trees/${slug}/gallery/${hit.personId}` : `/trees/${slug}/gallery`;
    }
    if (hit.kind === "place") return `/trees/${slug}/places`;
    if (hit.kind === "source") return `/trees/${slug}/sources`;
    return hit.personId ? `/trees/${slug}/persons/${hit.personId}` : `/trees/${slug}/members`;
}

/** A hit of the search over several trees: it carries the tree it came from. */
export type TreeSearchHit = {
    kind: "person" | "tree";
    id: string;
    /** The person a hit belongs to; the tree itself has none. */
    personId: string | null;
    title: string;
    detail: string;
    slug: string;
    treeTitle: string;
};

/**
 * The search for a reader who is not inside a tree: the people of every tree they are a member of,
 * and the trees themselves by their title. Only the names are looked up here - a place or a note of
 * another tree means little without the tree around it, and this window is for finding one's way.
 */
export async function searchAcrossTrees(userId: string, query: string): Promise<TreeSearchHit[]> {
    const needle = query.trim();
    if (needle.length < 2) return [];
    const pattern = `%${needle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

    const trees = await db
        .select({ id: schema.trees.id, slug: schema.trees.slug, title: schema.trees.title })
        .from(schema.treeMembers)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMembers.treeId))
        .where(eq(schema.treeMembers.userId, userId));

    const hits: TreeSearchHit[] = [];
    for (const tree of trees) {
        // A tree of the reader whose own title matches: the window moves between trees too.
        if (tree.title.toLowerCase().includes(needle.toLowerCase())) {
            hits.push({
                kind: "tree",
                id: tree.id,
                personId: null,
                title: tree.title,
                detail: "",
                slug: tree.slug,
                treeTitle: tree.title,
            });
        }

        const people = await db
            .select({
                personId: schema.personCards.personId,
                name: schema.personCards.fullName,
                birthYear: schema.personCards.birthYear,
            })
            .from(schema.personCards)
            .where(
                and(
                    eq(schema.personCards.treeId, tree.id),
                    ilike(schema.personCards.fullName, pattern),
                ),
            )
            .limit(10);
        for (const person of people) {
            hits.push({
                kind: "person",
                id: person.personId,
                personId: person.personId,
                title: person.name ?? "",
                detail: person.birthYear ? String(person.birthYear) : "",
                slug: tree.slug,
                treeTitle: tree.title,
            });
        }
    }
    return hits;
}
