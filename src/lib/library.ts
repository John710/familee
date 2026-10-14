/**
 * Familee - reading places, sources, citations, notes and the search over the archive
 *
 * Not a server action: called from server components after the caller's access to the tree has
 * been checked. Every query is limited to one tree.
 */

import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { db, schema } from "@/db";

export async function listPlaces(treeId: string) {
    return db
        .select({
            id: schema.places.id,
            name: schema.places.name,
            kind: schema.places.kind,
            parentId: schema.places.parentId,
            fullName: schema.places.fullName,
            notes: schema.places.notes,
        })
        .from(schema.places)
        .where(eq(schema.places.treeId, treeId))
        .orderBy(asc(schema.places.name));
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

/** The sources a person is cited for: the citation's page and the source's title. */
export async function listPersonCitations(treeId: string, personId: string) {
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

export type SearchHit = {
    kind: "person" | "place" | "source" | "note" | "event";
    id: string;
    /** The person a hit belongs to, for events and notes (the link goes there). */
    personId: string | null;
    title: string;
    detail: string;
};

/**
 * The search over the whole archive: people by name, places by name, sources by title and author,
 * notes and stories by their text, and events by their value and description. The query is matched
 * anywhere in the text, case-insensitively, and limited to the tree.
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
                or(ilike(schema.events.value, pattern), ilike(schema.events.description, pattern)),
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
    return hits;
}
