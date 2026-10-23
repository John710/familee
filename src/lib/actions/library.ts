"use server";

/**
 * Familee - places, sources, citations and notes (stories) of the archive
 *
 * Editors and above write; everybody in the tree reads (see lib/library.ts). Every write is
 * checked here, not only in the page, and goes to the audit log.
 */

import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { isValidLatitude, isValidLongitude, parseCoordinate } from "@/lib/geo";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type LibraryResult = { ok: true; id?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLACE_KINDS = [
    "country",
    "region",
    "oblast",
    "krai",
    "republic",
    "district",
    "city",
    "town",
    "village",
    "settlement",
    "street",
    "building",
    "cemetery",
    "church",
    "hospital",
    "other",
] as const;

async function editorAccess(slug: string) {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "auth.needSignIn" };
    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false as const, error: "auth.noPermission" };
    }
    return { ok: true as const, treeId: access.treeId, userId: user.id };
}

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

// ─── places ──────────────────────────────────────────────────────────────────

export type PlaceInput = {
    slug: string;
    id: string | null;
    name: string;
    kind: string;
    parentId: string | null;
    fullName: string;
    notes: string;
    /** A coordinate as typed: "54.1931" or "54,1931"; empty takes it away. */
    latitude: string;
    longitude: string;
};

export async function savePlaceAction(input: PlaceInput): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    const name = input.name.trim();
    if (name === "") return { ok: false, error: "validation.required" };
    if (!(PLACE_KINDS as readonly string[]).includes(input.kind)) {
        return { ok: false, error: "validation.required" };
    }
    if (input.parentId && (!UUID.test(input.parentId) || input.parentId === input.id)) {
        return { ok: false, error: "validation.required" };
    }

    // The coordinates are optional, but a coordinate that was typed has to be a real one, or the
    // map would place the village in the sea.
    const latitude = parseCoordinate(input.latitude);
    const longitude = parseCoordinate(input.longitude);
    if (input.latitude.trim() !== "" && (latitude === null || !isValidLatitude(latitude))) {
        return { ok: false, error: "validation.latitudeRange" };
    }
    if (input.longitude.trim() !== "" && (longitude === null || !isValidLongitude(longitude))) {
        return { ok: false, error: "validation.longitudeRange" };
    }

    const values = {
        name,
        kind: input.kind as (typeof PLACE_KINDS)[number],
        parentId: input.parentId,
        fullName: blank(input.fullName),
        notes: blank(input.notes),
        latitude,
        longitude,
        updatedAt: new Date(),
    };

    if (input.id) {
        if (!UUID.test(input.id)) return { ok: false, error: "validation.required" };
        const updated = await db
            .update(schema.places)
            .set(values)
            .where(and(eq(schema.places.id, input.id), eq(schema.places.treeId, access.treeId)))
            .returning({ id: schema.places.id });
        if (updated.length === 0) return { ok: false, error: "validation.required" };
        await writeAudit({
            treeId: access.treeId,
            userId: access.userId,
            action: "update",
            entityType: "place",
            entityId: input.id,
        });
        return { ok: true, id: input.id };
    }

    const [created] = await db
        .insert(schema.places)
        .values({ ...values, treeId: access.treeId })
        .returning({ id: schema.places.id });
    if (!created) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "create",
        entityType: "place",
        entityId: created.id,
    });
    return { ok: true, id: created.id };
}

export async function deletePlaceAction(input: {
    slug: string;
    id: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    if (!UUID.test(input.id)) return { ok: false, error: "validation.required" };
    const deleted = await db
        .delete(schema.places)
        .where(and(eq(schema.places.id, input.id), eq(schema.places.treeId, access.treeId)))
        .returning({ id: schema.places.id });
    if (deleted.length === 0) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "delete",
        entityType: "place",
        entityId: input.id,
    });
    return { ok: true };
}

// ─── sources ─────────────────────────────────────────────────────────────────

export type SourceInput = {
    slug: string;
    id: string | null;
    title: string;
    author: string;
    publication: string;
    url: string;
    textExcerpt: string;
};

export async function saveSourceAction(input: SourceInput): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    const title = input.title.trim();
    if (title === "") return { ok: false, error: "validation.required" };

    const values = {
        title,
        author: blank(input.author),
        publication: blank(input.publication),
        url: blank(input.url),
        textExcerpt: blank(input.textExcerpt),
        updatedAt: new Date(),
    };

    if (input.id) {
        if (!UUID.test(input.id)) return { ok: false, error: "validation.required" };
        const updated = await db
            .update(schema.sources)
            .set(values)
            .where(and(eq(schema.sources.id, input.id), eq(schema.sources.treeId, access.treeId)))
            .returning({ id: schema.sources.id });
        if (updated.length === 0) return { ok: false, error: "validation.required" };
        await writeAudit({
            treeId: access.treeId,
            userId: access.userId,
            action: "update",
            entityType: "source",
            entityId: input.id,
        });
        return { ok: true, id: input.id };
    }

    const [created] = await db
        .insert(schema.sources)
        .values({ ...values, treeId: access.treeId })
        .returning({ id: schema.sources.id });
    if (!created) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "create",
        entityType: "source",
        entityId: created.id,
    });
    return { ok: true, id: created.id };
}

export async function deleteSourceAction(input: {
    slug: string;
    id: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    if (!UUID.test(input.id)) return { ok: false, error: "validation.required" };
    const deleted = await db
        .delete(schema.sources)
        .where(and(eq(schema.sources.id, input.id), eq(schema.sources.treeId, access.treeId)))
        .returning({ id: schema.sources.id });
    if (deleted.length === 0) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "delete",
        entityType: "source",
        entityId: input.id,
    });
    return { ok: true };
}

// ─── citations: a source used for a person ───────────────────────────────────

export async function saveCitationAction(input: {
    slug: string;
    personId: string;
    sourceId: string;
    page: string;
    textExcerpt: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    if (!UUID.test(input.personId) || !UUID.test(input.sourceId)) {
        return { ok: false, error: "validation.required" };
    }

    // Both the person and the source must belong to this tree.
    const [person] = await db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(
            and(
                eq(schema.persons.id, input.personId),
                eq(schema.persons.treeId, access.treeId),
                isNull(schema.persons.deletedAt),
            ),
        )
        .limit(1);
    const [source] = await db
        .select({ id: schema.sources.id })
        .from(schema.sources)
        .where(and(eq(schema.sources.id, input.sourceId), eq(schema.sources.treeId, access.treeId)))
        .limit(1);
    if (!person || !source) return { ok: false, error: "person.notFound" };

    const [created] = await db
        .insert(schema.citations)
        .values({
            sourceId: input.sourceId,
            personId: input.personId,
            page: blank(input.page),
            textExcerpt: blank(input.textExcerpt),
        })
        .returning({ id: schema.citations.id });
    if (!created) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "create",
        entityType: "citation",
        entityId: created.id,
    });
    return { ok: true, id: created.id };
}

export async function deleteCitationAction(input: {
    slug: string;
    personId: string;
    citationId: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    if (!UUID.test(input.citationId) || !UUID.test(input.personId)) {
        return { ok: false, error: "validation.required" };
    }

    // The citation is scoped through its person, and the person has to be in this tree: without
    // this an editor of one archive could remove a citation of another by naming its person.
    const [person] = await db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(
            and(
                eq(schema.persons.id, input.personId),
                eq(schema.persons.treeId, access.treeId),
                isNull(schema.persons.deletedAt),
            ),
        )
        .limit(1);
    if (!person) return { ok: false, error: "person.notFound" };

    const deleted = await db
        .delete(schema.citations)
        .where(
            and(
                eq(schema.citations.id, input.citationId),
                eq(schema.citations.personId, input.personId),
            ),
        )
        .returning({ id: schema.citations.id });
    if (deleted.length === 0) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "delete",
        entityType: "citation",
        entityId: input.citationId,
    });
    return { ok: true };
}

// ─── citations for an event: the source of a fact such as a baptism or an occupation ───

/**
 * A citation of an event belongs to the event, and an event belongs to a person or to a union. The
 * caller says which one it is looking at, with exactly one of `personId` and `familyId`, so that a
 * marriage can be documented like a baptism without opening a way to cite an event of another tree.
 */
export async function saveEventCitationAction(input: {
    slug: string;
    personId?: string;
    familyId?: string;
    eventId: string;
    sourceId: string;
    page: string;
    textExcerpt: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    const owner = input.personId ?? input.familyId ?? "";
    if (![owner, input.eventId, input.sourceId].every((id) => UUID.test(id))) {
        return { ok: false, error: "validation.required" };
    }

    // The event must be one of this person's or this union's events, and the source of this tree.
    const [event] = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.id, input.eventId),
                input.personId
                    ? eq(schema.events.personId, input.personId)
                    : eq(schema.events.familyId, owner),
                eq(schema.events.treeId, access.treeId),
            ),
        )
        .limit(1);
    const [source] = await db
        .select({ id: schema.sources.id })
        .from(schema.sources)
        .where(and(eq(schema.sources.id, input.sourceId), eq(schema.sources.treeId, access.treeId)))
        .limit(1);
    if (!event || !source) {
        return { ok: false, error: input.personId ? "person.notFound" : "family.notFound" };
    }

    const [created] = await db
        .insert(schema.citations)
        .values({
            sourceId: input.sourceId,
            eventId: input.eventId,
            page: blank(input.page),
            textExcerpt: blank(input.textExcerpt),
        })
        .returning({ id: schema.citations.id });
    if (!created) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "create",
        entityType: "citation",
        entityId: created.id,
    });
    return { ok: true, id: created.id };
}

export async function deleteEventCitationAction(input: {
    slug: string;
    personId?: string;
    familyId?: string;
    citationId: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    const owner = input.personId ?? input.familyId ?? "";
    if (!UUID.test(input.citationId) || !UUID.test(owner)) {
        return { ok: false, error: "validation.required" };
    }

    // Only a citation of one of this person's or this union's events can be removed here.
    const [owned] = await db
        .select({ id: schema.citations.id })
        .from(schema.citations)
        .innerJoin(schema.events, eq(schema.events.id, schema.citations.eventId))
        .where(
            and(
                eq(schema.citations.id, input.citationId),
                input.personId
                    ? eq(schema.events.personId, input.personId)
                    : eq(schema.events.familyId, owner),
                eq(schema.events.treeId, access.treeId),
            ),
        )
        .limit(1);
    if (!owned) return { ok: false, error: "validation.required" };

    await db.delete(schema.citations).where(eq(schema.citations.id, input.citationId));
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "delete",
        entityType: "citation",
        entityId: input.citationId,
    });
    return { ok: true };
}

// ─── notes and stories about a person ────────────────────────────────────────

export async function saveNoteAction(input: {
    slug: string;
    personId: string;
    id: string | null;
    title: string;
    body: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    if (!UUID.test(input.personId)) return { ok: false, error: "person.notFound" };
    const body = input.body.trim();
    if (body === "") return { ok: false, error: "validation.required" };

    const [person] = await db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(
            and(
                eq(schema.persons.id, input.personId),
                eq(schema.persons.treeId, access.treeId),
                isNull(schema.persons.deletedAt),
            ),
        )
        .limit(1);
    if (!person) return { ok: false, error: "person.notFound" };

    const values = { title: blank(input.title), body, updatedAt: new Date() };

    if (input.id) {
        if (!UUID.test(input.id)) return { ok: false, error: "validation.required" };
        const updated = await db
            .update(schema.notes)
            .set(values)
            .where(
                and(
                    eq(schema.notes.id, input.id),
                    eq(schema.notes.personId, input.personId),
                    eq(schema.notes.treeId, access.treeId),
                ),
            )
            .returning({ id: schema.notes.id });
        if (updated.length === 0) return { ok: false, error: "validation.required" };
        await writeAudit({
            treeId: access.treeId,
            userId: access.userId,
            action: "update",
            entityType: "note",
            entityId: input.id,
        });
        return { ok: true, id: input.id };
    }

    const [created] = await db
        .insert(schema.notes)
        .values({ ...values, treeId: access.treeId, personId: input.personId })
        .returning({ id: schema.notes.id });
    if (!created) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "create",
        entityType: "note",
        entityId: created.id,
    });
    return { ok: true, id: created.id };
}

export async function deleteNoteAction(input: {
    slug: string;
    personId: string;
    id: string;
}): Promise<LibraryResult> {
    const access = await editorAccess(input.slug);
    if (!access.ok) return access;
    if (!UUID.test(input.id) || !UUID.test(input.personId)) {
        return { ok: false, error: "validation.required" };
    }
    const deleted = await db
        .delete(schema.notes)
        .where(
            and(
                eq(schema.notes.id, input.id),
                eq(schema.notes.personId, input.personId),
                eq(schema.notes.treeId, access.treeId),
            ),
        )
        .returning({ id: schema.notes.id });
    if (deleted.length === 0) return { ok: false, error: "validation.required" };
    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "delete",
        entityType: "note",
        entityId: input.id,
    });
    return { ok: true };
}
