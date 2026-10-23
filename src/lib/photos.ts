/**
 * Familee - photographs: storing them, linking them to people and events, the main one
 *
 * Not a server action: called from the upload routes and from the server actions, after the
 * caller's role in the tree has been checked. A photograph is stored once per tree (by its
 * checksum) and can be linked to several people and events. Each person has at most one main
 * photograph: the one on the card in the tree (see familee.person_cards).
 */

import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { isDay } from "@/lib/day";
import { isUniqueViolation } from "@/lib/db-errors";
import { exifDateFrom, exifDay } from "@/lib/exif-date";
import { classifyMedia } from "@/lib/media-kind";
import {
    binaryKey,
    type MediaVariantName,
    removeMediaFiles,
    variantKeys,
    writeMediaFile,
} from "@/lib/media-storage";
import { processPhoto } from "@/lib/photo-process";

export type PhotoError =
    | "media.errors.unsupported"
    | "media.errors.failed"
    | "media.errors.duplicate"
    | "validation.invalidDate"
    | "members.notMember"
    | "person.notFound"
    | "event.notFound";

export type PhotoCrop = { x: number; y: number; w: number; h: number };

export type PersonPhoto = {
    mediaId: string;
    /** photo · document · audio · video · other. */
    kind: string;
    /** The type the archive serves the original as. */
    mimeType: string;
    /** The name the file came from, for a document the reader has to recognize. */
    originalFilename: string | null;
    isPrimary: boolean;
    width: number | null;
    height: number | null;
    /** The part of the picture shown on the card, as fractions of the picture. */
    crop: PhotoCrop | null;
    /** What was written under the photograph in this person's album; null when nothing was. */
    caption: string | null;
    /** The day the photograph was taken, as "2007-04-21"; null when the file did not say. */
    takenStart: string | null;
};

export type TreePhoto = {
    mediaId: string;
    /** photo · document · audio · video · other. */
    kind: string;
    mimeType: string;
    originalFilename: string | null;
    width: number | null;
    height: number | null;
    /** The day the photograph was taken, as "2007-04-21"; null when the file did not say. */
    takenStart: string | null;
    /**
     * What is written under the photograph, one entry per album that holds it: the same picture can
     * have a different caption on the card of a father and of a son.
     */
    captions: string[];
    /** Who is in the photograph, by the name the tree gives them (see media_people). */
    tagged: string[];
    /** The people and the events the photograph is attached to, by their names. */
    links: {
        personId: string | null;
        personName: string | null;
        eventId: string | null;
        /** The event's type code and its value, for the caption ("birth", "occupation"...). */
        eventType: string | null;
        eventValue: string | null;
    }[];
};

/** The photographs of a person, the main one first and the rest in the order set by hand. */
export async function listPersonPhotos(treeId: string, personId: string): Promise<PersonPhoto[]> {
    const rows = await db
        .select({
            mediaId: schema.media.id,
            kind: schema.media.kind,
            mimeType: schema.media.mimeType,
            originalFilename: schema.media.originalFilename,
            isPrimary: schema.mediaLinks.isPrimary,
            width: schema.media.width,
            height: schema.media.height,
            cropX: schema.mediaLinks.cropX,
            cropY: schema.mediaLinks.cropY,
            cropW: schema.mediaLinks.cropW,
            cropH: schema.mediaLinks.cropH,
            caption: schema.mediaLinks.caption,
            takenStart: schema.media.takenStart,
        })
        .from(schema.mediaLinks)
        .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
        .where(and(eq(schema.mediaLinks.personId, personId), eq(schema.media.treeId, treeId)))
        .orderBy(
            desc(schema.mediaLinks.isPrimary),
            asc(schema.mediaLinks.sortOrder),
            asc(schema.mediaLinks.createdAt),
        );

    return rows.map((row) => ({
        mediaId: row.mediaId,
        kind: row.kind,
        mimeType: row.mimeType,
        originalFilename: row.originalFilename,
        isPrimary: row.isPrimary,
        width: row.width,
        height: row.height,
        crop:
            row.cropX === null || row.cropY === null || row.cropW === null || row.cropH === null
                ? null
                : { x: row.cropX, y: row.cropY, w: row.cropW, h: row.cropH },
        caption: row.caption,
        takenStart: row.takenStart,
    }));
}

/** Who is in a photograph, as the album shows it. */
export type PhotoPerson = { personId: string; name: string | null };

/** Who is in each of these photographs, by the name the tree gives the people. */
export async function listPhotoPeople(
    treeId: string,
    mediaIds: string[],
): Promise<Map<string, PhotoPerson[]>> {
    const people = new Map<string, PhotoPerson[]>();
    if (mediaIds.length === 0) return people;

    const rows = await db
        .select({
            mediaId: schema.mediaPeople.mediaId,
            personId: schema.mediaPeople.personId,
            name: schema.personCards.fullName,
        })
        .from(schema.mediaPeople)
        .innerJoin(schema.personCards, eq(schema.personCards.personId, schema.mediaPeople.personId))
        .where(
            and(
                eq(schema.mediaPeople.treeId, treeId),
                inArray(schema.mediaPeople.mediaId, mediaIds),
            ),
        )
        .orderBy(asc(schema.personCards.fullName));

    for (const row of rows) {
        const entry = { personId: row.personId, name: row.name };
        const list = people.get(row.mediaId);
        if (list) list.push(entry);
        else people.set(row.mediaId, [entry]);
    }
    return people;
}

/** Writes what stands under one photograph in one person's album; an empty caption clears it. */
export async function setPhotoCaption(input: {
    treeId: string;
    personId: string;
    mediaId: string;
    caption: string;
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    if (!(await personInTree(input.treeId, input.personId))) {
        return { ok: false, error: "person.notFound" };
    }

    const [link] = await db
        .select({ id: schema.mediaLinks.id, caption: schema.mediaLinks.caption })
        .from(schema.mediaLinks)
        .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
        .where(
            and(
                eq(schema.mediaLinks.mediaId, input.mediaId),
                eq(schema.mediaLinks.personId, input.personId),
                eq(schema.media.treeId, input.treeId),
            ),
        )
        .limit(1);
    if (!link) return { ok: false, error: "media.errors.failed" };

    const caption = input.caption.trim() === "" ? null : input.caption.trim().slice(0, 500);

    await db
        .update(schema.mediaLinks)
        .set({ caption, updatedAt: new Date() })
        .where(eq(schema.mediaLinks.id, link.id));

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "update",
        entityType: "person_photo",
        entityId: input.personId,
        changes: { caption: { from: link.caption, to: caption } },
    });
    return { ok: true };
}

/**
 * Writes the day a photograph was taken. The date lives on the picture itself, not on one album, so
 * the same correction reaches every card that shows it. An empty value clears it: most scanned
 * pictures have no Exif date at all, and a wrong one is worse than none.
 */
export async function setPhotoDate(input: {
    treeId: string;
    mediaId: string;
    /** "2007-04-21", or null to clear the date. */
    date: string | null;
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    if (input.date !== null && !isDay(input.date)) {
        return { ok: false, error: "validation.invalidDate" };
    }

    const [photo] = await db
        .select({ id: schema.media.id, takenStart: schema.media.takenStart })
        .from(schema.media)
        .where(and(eq(schema.media.id, input.mediaId), eq(schema.media.treeId, input.treeId)))
        .limit(1);
    if (!photo) return { ok: false, error: "media.errors.failed" };

    await db
        .update(schema.media)
        .set({ takenStart: input.date, takenPrecision: "day", updatedAt: new Date() })
        .where(eq(schema.media.id, photo.id));

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "update",
        entityType: "photo",
        entityId: photo.id,
        changes: { takenStart: { from: photo.takenStart, to: input.date } },
    });
    return { ok: true };
}

/**
 * Moves one photograph of an album one place towards the front or the back. The main photograph
 * stays where it is - the order is rewritten for the whole album, so two photographs that carry the
 * same sort order from before still end up in a defined order.
 */
export async function movePhoto(input: {
    treeId: string;
    personId: string;
    mediaId: string;
    /** -1 towards the front, 1 towards the back. */
    delta: number;
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    const rows = await db
        .select({
            id: schema.mediaLinks.id,
            mediaId: schema.mediaLinks.mediaId,
            isPrimary: schema.mediaLinks.isPrimary,
        })
        .from(schema.mediaLinks)
        .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
        .where(
            and(
                eq(schema.mediaLinks.personId, input.personId),
                eq(schema.media.treeId, input.treeId),
            ),
        )
        .orderBy(
            desc(schema.mediaLinks.isPrimary),
            asc(schema.mediaLinks.sortOrder),
            asc(schema.mediaLinks.createdAt),
        );

    const index = rows.findIndex((row) => row.mediaId === input.mediaId);
    if (index < 0) return { ok: false, error: "media.errors.failed" };

    // The main photograph is always the first; the others move below it.
    const floor = rows[0]?.isPrimary ? 1 : 0;
    const target = Math.min(Math.max(index + input.delta, floor), rows.length - 1);
    if (target === index) return { ok: true };

    const order = [...rows];
    const [moved] = order.splice(index, 1);
    if (!moved) return { ok: false, error: "media.errors.failed" };
    order.splice(target, 0, moved);

    await db.transaction(async (tx) => {
        for (const [position, row] of order.entries()) {
            await tx
                .update(schema.mediaLinks)
                .set({ sortOrder: position, updatedAt: new Date() })
                .where(eq(schema.mediaLinks.id, row.id));
        }
    });

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "update",
        entityType: "person_photo",
        entityId: input.personId,
        changes: { order: { from: index, to: target } },
    });
    return { ok: true };
}

/**
 * Sets who is in a photograph. The tags are replaced whole, so the caller sends the people who
 * should be there and nothing else; a person who is not in the tree, or is in its trash, is
 * refused. The photograph itself is not touched - tagging is not an album link.
 */
export async function setPhotoPeople(input: {
    treeId: string;
    mediaId: string;
    personIds: string[];
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    const [photo] = await db
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(and(eq(schema.media.id, input.mediaId), eq(schema.media.treeId, input.treeId)))
        .limit(1);
    if (!photo) return { ok: false, error: "media.errors.failed" };

    const wanted = [...new Set(input.personIds)].slice(0, 200);
    if (wanted.length > 0) {
        const live = await db
            .select({ id: schema.persons.id })
            .from(schema.persons)
            .where(
                and(
                    eq(schema.persons.treeId, input.treeId),
                    isNull(schema.persons.deletedAt),
                    inArray(schema.persons.id, wanted),
                ),
            );
        if (live.length !== wanted.length) return { ok: false, error: "person.notFound" };
    }

    const before = await db
        .select({ personId: schema.mediaPeople.personId })
        .from(schema.mediaPeople)
        .where(
            and(
                eq(schema.mediaPeople.treeId, input.treeId),
                eq(schema.mediaPeople.mediaId, input.mediaId),
            ),
        );

    await db.transaction(async (tx) => {
        await tx
            .delete(schema.mediaPeople)
            .where(
                and(
                    eq(schema.mediaPeople.treeId, input.treeId),
                    eq(schema.mediaPeople.mediaId, input.mediaId),
                ),
            );
        if (wanted.length > 0) {
            await tx.insert(schema.mediaPeople).values(
                wanted.map((personId) => ({
                    treeId: input.treeId,
                    mediaId: input.mediaId,
                    personId,
                    createdBy: input.userId,
                })),
            );
        }
    });

    const list = (ids: string[]) => (ids.length > 0 ? ids.join(", ") : null);
    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "update",
        entityType: "photo_people",
        entityId: input.mediaId,
        changes: { people: { from: list(before.map((row) => row.personId)), to: list(wanted) } },
    });
    return { ok: true };
}

/**
 * Sets the part of the main photograph that the card shows, or clears it (null). The crop is
 * stored on the person's link to the picture, so the same picture can be cut differently for
 * another person.
 */
export async function setPortraitCrop(input: {
    treeId: string;
    personId: string;
    mediaId: string;
    crop: PhotoCrop | null;
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    if (!(await personInTree(input.treeId, input.personId))) {
        return { ok: false, error: "person.notFound" };
    }

    const [link] = await db
        .select({
            id: schema.mediaLinks.id,
            cropX: schema.mediaLinks.cropX,
            cropY: schema.mediaLinks.cropY,
            cropW: schema.mediaLinks.cropW,
            cropH: schema.mediaLinks.cropH,
        })
        .from(schema.mediaLinks)
        .where(
            and(
                eq(schema.mediaLinks.mediaId, input.mediaId),
                eq(schema.mediaLinks.personId, input.personId),
            ),
        )
        .limit(1);
    if (!link) return { ok: false, error: "media.errors.failed" };

    await db
        .update(schema.mediaLinks)
        .set({
            cropX: input.crop?.x ?? null,
            cropY: input.crop?.y ?? null,
            cropW: input.crop?.w ?? null,
            cropH: input.crop?.h ?? null,
            updatedAt: new Date(),
        })
        .where(eq(schema.mediaLinks.id, link.id));

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "update",
        entityType: "person_photo",
        entityId: input.personId,
        changes: {
            crop: {
                from: cropText(link.cropX, link.cropY, link.cropW, link.cropH),
                to: input.crop
                    ? cropText(input.crop.x, input.crop.y, input.crop.w, input.crop.h)
                    : null,
            },
        },
    });
    return { ok: true };
}

/** A file of an event. The caption is the one written at the event, not in an album. */
export type EventPhoto = {
    mediaId: string;
    /** photo · document · audio · video · other. */
    kind: string;
    mimeType: string;
    originalFilename: string | null;
    isPrimary: boolean;
    width: number | null;
    height: number | null;
    caption: string | null;
    /** The day the photograph was taken, as "2007-04-21"; null when the file did not say. */
    takenStart: string | null;
};

/** The files of an event, in the order they were added. */
export async function listEventPhotos(treeId: string, eventId: string): Promise<EventPhoto[]> {
    return db
        .select({
            mediaId: schema.media.id,
            kind: schema.media.kind,
            mimeType: schema.media.mimeType,
            originalFilename: schema.media.originalFilename,
            isPrimary: schema.mediaLinks.isPrimary,
            width: schema.media.width,
            height: schema.media.height,
            caption: schema.mediaLinks.caption,
            takenStart: schema.media.takenStart,
        })
        .from(schema.mediaLinks)
        .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
        .where(and(eq(schema.mediaLinks.eventId, eventId), eq(schema.media.treeId, treeId)))
        .orderBy(asc(schema.mediaLinks.createdAt));
}

/** Every file of a tree, newest first, with the people and events it is attached to. */
export async function listTreePhotos(treeId: string): Promise<TreePhoto[]> {
    const rows = await db
        .select({
            mediaId: schema.media.id,
            kind: schema.media.kind,
            mimeType: schema.media.mimeType,
            originalFilename: schema.media.originalFilename,
            width: schema.media.width,
            height: schema.media.height,
            createdAt: schema.media.createdAt,
            takenStart: schema.media.takenStart,
            caption: schema.mediaLinks.caption,
            personId: schema.mediaLinks.personId,
            eventId: schema.mediaLinks.eventId,
            eventType: schema.events.typeCode,
            eventValue: schema.events.value,
            eventPersonId: schema.events.personId,
        })
        .from(schema.media)
        .leftJoin(schema.mediaLinks, eq(schema.mediaLinks.mediaId, schema.media.id))
        .leftJoin(schema.events, eq(schema.events.id, schema.mediaLinks.eventId))
        .where(eq(schema.media.treeId, treeId))
        // The photographs whose day is known come first, newest of them leading; the rest - the
        // scans and the pictures of an unknown year - follow by the day they were uploaded.
        .orderBy(sql`${schema.media.takenStart} desc nulls last`, desc(schema.media.createdAt));

    // The names of the people, so that a photograph of an event names the person the event belongs to.
    const cards = await db
        .select({ personId: schema.personCards.personId, name: schema.personCards.fullName })
        .from(schema.personCards)
        .where(eq(schema.personCards.treeId, treeId));
    const nameOf = new Map(cards.map((card) => [card.personId, card.name]));

    const byId = new Map<string, TreePhoto>();
    for (const row of rows) {
        let photo = byId.get(row.mediaId);
        if (!photo) {
            photo = {
                mediaId: row.mediaId,
                kind: row.kind,
                mimeType: row.mimeType,
                originalFilename: row.originalFilename,
                width: row.width,
                height: row.height,
                takenStart: row.takenStart,
                captions: [],
                tagged: [],
                links: [],
            };
            byId.set(row.mediaId, photo);
        }
        if (row.caption && !photo.captions.includes(row.caption)) {
            photo.captions.push(row.caption);
        }
        if (row.personId || row.eventId) {
            // A photograph of an event is attributed to the person the event belongs to.
            const owner = row.eventId ? row.eventPersonId : row.personId;
            photo.links.push({
                personId: owner ?? null,
                personName: owner ? (nameOf.get(owner) ?? null) : null,
                eventId: row.eventId,
                eventType: row.eventType,
                eventValue: row.eventValue,
            });
        }
    }

    const tagged = await listPhotoPeople(treeId, [...byId.keys()]);
    for (const [mediaId, people] of tagged) {
        const photo = byId.get(mediaId);
        if (!photo) continue;
        photo.tagged = people.flatMap((person) => (person.name ? [person.name] : []));
    }
    return [...byId.values()];
}

async function personInTree(treeId: string, personId: string): Promise<boolean> {
    const [row] = await db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(
            and(
                eq(schema.persons.id, personId),
                eq(schema.persons.treeId, treeId),
                isNull(schema.persons.deletedAt),
            ),
        )
        .limit(1);
    return row !== undefined;
}

/**
 * Whether an event of this tree is still shown. An event belongs to a person or to a union, and
 * either way the subject must not have gone to the trash: a photograph would otherwise be added to
 * something no page shows any more (a union is hidden once all of its partners are deleted, see
 * migration 0012). The subject xor guarantees exactly one of the two subqueries can match.
 */
async function eventInTree(treeId: string, eventId: string): Promise<boolean> {
    const [row] = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
            sql`${schema.events.id} = ${eventId}
                and ${schema.events.treeId} = ${treeId}
                and (
                    exists (select 1 from familee.persons p
                             where p.id = ${schema.events.personId} and p.deleted_at is null)
                    or exists (select 1 from familee.family_partners fp
                               join familee.persons fp_p on fp_p.id = fp.person_id
                               where fp.family_id = ${schema.events.familyId}
                                 and fp_p.deleted_at is null)
                )`,
        )
        .limit(1);
    return row !== undefined;
}

/**
 * Stores a file in the tree: the bytes on disk and the rows in the database. A photograph goes
 * through the picture pipeline and is kept as three WebP variants; a document, a recording or a
 * film is kept exactly as it came, under the extension its kind table chose. The same file again is
 * not stored twice; the existing record is returned instead.
 */
async function storeMedia(input: {
    treeId: string;
    userId: string;
    source: Buffer;
    originalFilename: string | null;
    /** The type the browser declared; only a hint, the kind table has the last word. */
    declaredType?: string | null;
}): Promise<{ ok: true; mediaId: string; existed: boolean } | { ok: false; error: PhotoError }> {
    const checksum = createHash("sha256").update(input.source).digest("hex");

    const [existing] = await db
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(
            and(eq(schema.media.treeId, input.treeId), eq(schema.media.checksumSha256, checksum)),
        )
        .limit(1);
    if (existing) return { ok: true, mediaId: existing.id, existed: true };

    const classified = classifyMedia(input.declaredType, input.originalFilename);
    if (!classified.processable) {
        return storeBinary({ ...input, checksum, classified });
    }

    const processed = await processPhoto(input.source);
    if (!processed.ok) return processed;
    const photo = processed.photo;

    // Each attempt owns its paths. A losing checksum race must never overwrite
    // or remove the variants belonging to the successful upload.
    const storageId = randomBytes(32).toString("hex");
    const keys = variantKeys(input.treeId, storageId);
    const names = Object.keys(keys) as MediaVariantName[];
    const written: string[] = [];
    try {
        for (const name of names) {
            // Include partially written files in cleanup when writeFile rejects.
            written.push(keys[name]);
            await writeMediaFile(keys[name], photo.variants[name].data);
        }
    } catch {
        await removeMediaFiles(written);
        return { ok: false, error: "media.errors.failed" };
    }

    try {
        // The moment the camera wrote into the file, when it wrote one: the reader is pure and
        // never throws, so a broken Exif block costs nothing but a missing date.
        const moment = exifDateFrom(input.source);
        const mediaId = await db.transaction(async (tx) => {
            const [created] = await tx
                .insert(schema.media)
                .values({
                    treeId: input.treeId,
                    kind: "photo",
                    storageKey: keys.original,
                    checksumSha256: checksum,
                    originalFilename: input.originalFilename,
                    mimeType: "image/webp",
                    byteSize: photo.variants.original.data.length,
                    width: photo.width,
                    height: photo.height,
                    takenStart: moment ? exifDay(moment) : null,
                    takenQualifier: "exact",
                    takenPrecision: "day",
                    uploadedBy: input.userId,
                })
                .onConflictDoNothing()
                .returning({ id: schema.media.id });
            if (!created) return null;

            await tx.insert(schema.mediaVariants).values(
                names.map((name) => ({
                    mediaId: created.id,
                    variant: name,
                    format: "webp",
                    storageKey: keys[name],
                    width: photo.variants[name].width,
                    height: photo.variants[name].height,
                    byteSize: photo.variants[name].data.length,
                })),
            );
            return created.id;
        });
        if (mediaId === null) {
            await removeMediaFiles(written);
            return await adoptExisting(input.treeId, checksum);
        }
        return { ok: true, mediaId, existed: false };
    } catch {
        await removeMediaFiles(written);
        return { ok: false, error: "media.errors.failed" };
    }
}

/**
 * Stores a file that is not a picture: one copy of the bytes under the extension of its kind, a row
 * that carries the kind and the type the archive serves it as, and no variants. Sound and film are
 * kept whole on purpose, so a player can seek in them with a Range request.
 */
async function storeBinary(input: {
    treeId: string;
    userId: string;
    source: Buffer;
    originalFilename: string | null;
    checksum: string;
    classified: ReturnType<typeof classifyMedia>;
}): Promise<{ ok: true; mediaId: string; existed: boolean } | { ok: false; error: PhotoError }> {
    const storageId = randomBytes(32).toString("hex");
    const key = binaryKey(input.treeId, storageId, input.classified.extension);

    try {
        await writeMediaFile(key, input.source);
    } catch {
        return { ok: false, error: "media.errors.failed" };
    }

    try {
        const mediaId = await db.transaction(async (tx) => {
            const [created] = await tx
                .insert(schema.media)
                .values({
                    treeId: input.treeId,
                    kind: input.classified.kind,
                    storageKey: key,
                    checksumSha256: input.checksum,
                    originalFilename: input.originalFilename,
                    mimeType: input.classified.mimeType,
                    byteSize: input.source.length,
                    uploadedBy: input.userId,
                })
                .onConflictDoNothing()
                .returning({ id: schema.media.id });
            return created?.id ?? null;
        });
        if (mediaId === null) {
            await removeMediaFiles([key]);
            return await adoptExisting(input.treeId, input.checksum);
        }
        return { ok: true, mediaId, existed: false };
    } catch {
        await removeMediaFiles([key]);
        return { ok: false, error: "media.errors.failed" };
    }
}

/**
 * After a checksum race lost, the record another request wrote is adopted: the loser removes its
 * own files and links the winner's file instead.
 */
async function adoptExisting(
    treeId: string,
    checksum: string,
): Promise<{ ok: true; mediaId: string; existed: boolean } | { ok: false; error: PhotoError }> {
    const [winner] = await db
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(and(eq(schema.media.treeId, treeId), eq(schema.media.checksumSha256, checksum)))
        .limit(1);
    return winner
        ? { ok: true, mediaId: winner.id, existed: true }
        : { ok: false, error: "media.errors.failed" };
}

/** Adds a photograph to a person. The same file again is only linked, not stored twice. */
export async function addPersonPhoto(input: {
    treeId: string;
    personId: string;
    userId: string;
    source: Buffer;
    originalFilename: string | null;
    /** The type the browser declared; only a hint for the kind table. */
    declaredType?: string | null;
}): Promise<{ ok: true; mediaId: string } | { ok: false; error: PhotoError }> {
    if (!(await personInTree(input.treeId, input.personId))) {
        return { ok: false, error: "person.notFound" };
    }

    const [mainLink] = await db
        .select({ id: schema.mediaLinks.id })
        .from(schema.mediaLinks)
        .where(
            and(
                eq(schema.mediaLinks.personId, input.personId),
                eq(schema.mediaLinks.isPrimary, true),
            ),
        )
        .limit(1);
    // Only a fast path: two uploads may pass it at once. The guarded insert below decides which
    // of them takes the one main place of the person. And only a photograph may take it: a
    // document, a recording or a film that arrives first stays a gallery file, so the first real
    // photograph still becomes the portrait.
    const becomesMain =
        mainLink === undefined &&
        classifyMedia(input.declaredType, input.originalFilename).kind === "photo";

    const stored = await storeMedia(input);
    if (!stored.ok) return stored;

    const linked = await linkPhoto({
        mediaId: stored.mediaId,
        personId: input.personId,
        wantsMain: becomesMain,
    });
    if (!linked) return { ok: false, error: "media.errors.duplicate" };

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "create",
        entityType: "person_photo",
        entityId: input.personId,
        changes: {
            photo: { from: null, to: stored.mediaId },
            file: { from: null, to: input.originalFilename },
        },
    });

    if (!stored.existed) {
        await writeAudit({
            treeId: input.treeId,
            userId: input.userId,
            action: "create",
            entityType: "media",
            entityId: stored.mediaId,
            changes: { file: { from: null, to: input.originalFilename } },
        });
    }
    return { ok: true, mediaId: stored.mediaId };
}

/**
 * Links a photograph to a person, giving it the one main place when asked. The tree's partial
 * unique indexes allow one main photograph per person and one link of a file to a person, so two
 * uploads racing for the first place must not fail: the later one becomes a gallery photograph.
 * Returns false when the file is already in the person's album.
 */
async function linkPhoto(input: {
    mediaId: string;
    personId: string;
    wantsMain: boolean;
}): Promise<boolean> {
    const insert = (isPrimary: boolean) =>
        db
            .insert(schema.mediaLinks)
            .values({
                mediaId: input.mediaId,
                personId: input.personId,
                role: isPrimary ? "portrait" : "gallery",
                isPrimary,
            })
            .onConflictDoNothing()
            .returning({ id: schema.mediaLinks.id });

    const [created] = await insert(input.wantsMain);
    if (created) return true;

    // Nothing was inserted: the file is either already linked, or another upload took the main
    // place. A second attempt as a gallery photograph tells the two apart.
    const [retry] = await insert(false);
    return retry !== undefined;
}

/** Runs `run` again once after a unique-index race; a re-read of the links settles it. */
async function retryOnUniqueViolation<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return run();
    }
}

/** Adds a photograph to an event (a document, a place, the event itself). */
export async function addEventPhoto(input: {
    treeId: string;
    eventId: string;
    userId: string;
    source: Buffer;
    originalFilename: string | null;
    /** The type the browser declared; only a hint for the kind table. */
    declaredType?: string | null;
}): Promise<{ ok: true; mediaId: string } | { ok: false; error: PhotoError }> {
    if (!(await eventInTree(input.treeId, input.eventId))) {
        return { ok: false, error: "event.notFound" };
    }

    const stored = await storeMedia(input);
    if (!stored.ok) return stored;

    // The unique index media_links_media_event_key decides: two uploads of the same file to the
    // same event at once cannot both insert, so the database settles it and not a read that both
    // requests may pass. Nothing inserted means the file is already on that event.
    const [linked] = await db
        .insert(schema.mediaLinks)
        .values({
            mediaId: stored.mediaId,
            eventId: input.eventId,
            role: "document",
            isPrimary: false,
        })
        .onConflictDoNothing()
        .returning({ id: schema.mediaLinks.id });
    if (!linked) return { ok: false, error: "media.errors.duplicate" };

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "create",
        entityType: "event_photo",
        entityId: input.eventId,
        changes: {
            photo: { from: null, to: stored.mediaId },
            file: { from: null, to: input.originalFilename },
        },
    });

    if (!stored.existed) {
        await writeAudit({
            treeId: input.treeId,
            userId: input.userId,
            action: "create",
            entityType: "media",
            entityId: stored.mediaId,
            changes: { file: { from: null, to: input.originalFilename } },
        });
    }
    return { ok: true, mediaId: stored.mediaId };
}

/** Makes one photograph the main one of a person; the others stay in the album. */
export async function setMainPhoto(input: {
    treeId: string;
    personId: string;
    mediaId: string;
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    if (!(await personInTree(input.treeId, input.personId))) {
        return { ok: false, error: "person.notFound" };
    }

    // A concurrent change of the main photograph may commit between the two updates below; the
    // unique index then refuses this one. Re-reading the links settles it, so it is tried again.
    const updated = await retryOnUniqueViolation(() =>
        db.transaction(async (tx) => {
            const [link] = await tx
                .select({ id: schema.mediaLinks.id })
                .from(schema.mediaLinks)
                .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
                .where(
                    and(
                        eq(schema.mediaLinks.mediaId, input.mediaId),
                        eq(schema.mediaLinks.personId, input.personId),
                        // Only a photograph may stand on the card; a document is never a portrait.
                        eq(schema.media.kind, "photo"),
                    ),
                )
                .limit(1);
            if (!link) return null;

            const [previous] = await tx
                .select({ mediaId: schema.mediaLinks.mediaId })
                .from(schema.mediaLinks)
                .where(
                    and(
                        eq(schema.mediaLinks.personId, input.personId),
                        eq(schema.mediaLinks.isPrimary, true),
                    ),
                )
                .limit(1);

            // Clear the old main photograph first: the index allows one per person at a time.
            await tx
                .update(schema.mediaLinks)
                .set({ isPrimary: false, role: "gallery", updatedAt: new Date() })
                .where(
                    and(
                        eq(schema.mediaLinks.personId, input.personId),
                        ne(schema.mediaLinks.id, link.id),
                    ),
                );
            await tx
                .update(schema.mediaLinks)
                .set({ isPrimary: true, role: "portrait", updatedAt: new Date() })
                .where(eq(schema.mediaLinks.id, link.id));
            return { previous: previous?.mediaId ?? null };
        }),
    );

    if (!updated) return { ok: false, error: "media.errors.failed" };

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "update",
        entityType: "person_photo",
        entityId: input.personId,
        changes:
            updated.previous === input.mediaId
                ? null
                : { main: { from: updated.previous, to: input.mediaId } },
    });
    return { ok: true };
}

/** A crop as the audit log shows it: the four fractions, or null when there is no crop. */
function cropText(
    x: number | null,
    y: number | null,
    w: number | null,
    h: number | null,
): string | null {
    if (x === null || y === null || w === null || h === null) return null;
    return `${Math.round(x * 100)}% · ${Math.round(y * 100)}% · ${Math.round(w * 100)}% · ${Math.round(h * 100)}%`;
}

/**
 * Takes a photograph off a person or an event. If it was the main photograph of a person, the
 * newest remaining one becomes the main one. The file itself stays in the tree, where the gallery
 * shows it as unattached: a broken link is not a reason to destroy the photograph or its notes.
 */
export async function removePhotoLink(input: {
    treeId: string;
    target: { personId: string } | { eventId: string };
    mediaId: string;
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    const targetMatches =
        "personId" in input.target
            ? and(
                  eq(schema.mediaLinks.personId, input.target.personId),
                  eq(schema.mediaLinks.mediaId, input.mediaId),
              )
            : and(
                  eq(schema.mediaLinks.eventId, input.target.eventId),
                  eq(schema.mediaLinks.mediaId, input.mediaId),
              );

    if ("personId" in input.target) {
        if (!(await personInTree(input.treeId, input.target.personId))) {
            return { ok: false, error: "person.notFound" };
        }
    } else if (!(await eventInTree(input.treeId, input.target.eventId))) {
        return { ok: false, error: "event.notFound" };
    }

    // The link goes; the file stays. The gallery of the tree still shows it as unattached, its notes
    // and the tags of the people in it keep their point, and deleting it for good stays a separate,
    // deliberate act (the trash of a person, or the deletion of the tree).
    const removed = await retryOnUniqueViolation(() =>
        db.transaction(async (tx) => {
            const [row] = await tx
                .delete(schema.mediaLinks)
                .where(targetMatches)
                .returning({ wasMain: schema.mediaLinks.isPrimary });
            if (!row) return false;

            if (row.wasMain && "personId" in input.target) {
                const [next] = await tx
                    .select({ id: schema.mediaLinks.id })
                    .from(schema.mediaLinks)
                    .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
                    .where(
                        and(
                            eq(schema.mediaLinks.personId, input.target.personId),
                            eq(schema.media.kind, "photo"),
                        ),
                    )
                    .orderBy(desc(schema.mediaLinks.createdAt))
                    .limit(1);
                if (next) {
                    await tx
                        .update(schema.mediaLinks)
                        .set({ isPrimary: true, role: "portrait", updatedAt: new Date() })
                        .where(eq(schema.mediaLinks.id, next.id));
                }
            }

            return true;
        }),
    );

    if (!removed) return { ok: false, error: "media.errors.failed" };

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "delete",
        entityType: "personId" in input.target ? "person_photo" : "event_photo",
        entityId: "personId" in input.target ? input.target.personId : input.target.eventId,
        changes: {
            photo: { from: input.mediaId, to: null },
        },
    });
    return { ok: true };
}

/** Takes a photograph off a person (the album). */
export async function removePersonPhoto(input: {
    treeId: string;
    personId: string;
    mediaId: string;
    userId: string;
}) {
    return removePhotoLink({
        treeId: input.treeId,
        target: { personId: input.personId },
        mediaId: input.mediaId,
        userId: input.userId,
    });
}

/** A file of the tree, ready to be read: where it lies, what it is and how it is served. */
export type MediaFile = {
    key: string;
    /** The type the archive serves it as; for a photograph's variants, always a WebP. */
    mimeType: string;
    /** The name the file came from, offered to the browser when it saves it. */
    filename: string | null;
    byteSize: number;
};

/**
 * The file behind one address: a variant of a photograph, or the original of any file. A photograph
 * keeps three WebP variants; every other kind keeps a single copy, whose key is the media row
 * itself, so a document, a recording or a film is found without a variant row. Null when the file
 * is not there - the caller answers 404, the same as for a tree that does not exist.
 */
export async function findMediaFile(
    treeId: string,
    mediaId: string,
    variant: MediaVariantName,
): Promise<MediaFile | null> {
    const [mediaRow] = await db
        .select({
            storageKey: schema.media.storageKey,
            mimeType: schema.media.mimeType,
            filename: schema.media.originalFilename,
            byteSize: schema.media.byteSize,
        })
        .from(schema.media)
        .where(and(eq(schema.media.id, mediaId), eq(schema.media.treeId, treeId)))
        .limit(1);
    if (!mediaRow) return null;

    const [variantRow] = await db
        .select({ key: schema.mediaVariants.storageKey, byteSize: schema.mediaVariants.byteSize })
        .from(schema.mediaVariants)
        .where(
            and(
                eq(schema.mediaVariants.mediaId, mediaId),
                eq(schema.mediaVariants.variant, variant),
            ),
        )
        .limit(1);

    if (variantRow) {
        return {
            key: variantRow.key,
            // Every variant the pipeline writes is a WebP, whatever the original was.
            mimeType: "image/webp",
            filename: mediaRow.filename,
            // The size of the variant itself: a Range is measured against what is actually served.
            byteSize: variantRow.byteSize,
        };
    }

    // No variant: only the whole file itself is on offer (a document, a recording, a film).
    if (variant !== "original") return null;
    return {
        key: mediaRow.storageKey,
        mimeType: mediaRow.mimeType,
        filename: mediaRow.filename,
        byteSize: mediaRow.byteSize,
    };
}

/**
 * Everything in a person's album: their own photographs, and the photographs of the events that
 * belong to them. A photograph can appear twice (once as the person's, once under an event).
 */
export async function listPersonAlbum(
    treeId: string,
    personId: string,
): Promise<
    {
        mediaId: string;
        kind: string;
        mimeType: string;
        originalFilename: string | null;
        eventType: string | null;
        eventValue: string | null;
        caption: string | null;
        takenStart: string | null;
    }[]
> {
    const own = await listPersonPhotos(treeId, personId);
    const events = await db
        .select({
            id: schema.events.id,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
        })
        .from(schema.events)
        .where(and(eq(schema.events.treeId, treeId), eq(schema.events.personId, personId)))
        .orderBy(asc(schema.events.sortDate), asc(schema.events.createdAt));

    // The photographs of every event of the person, in one query instead of one per event.
    const eventRows =
        events.length === 0
            ? []
            : await db
                  .select({
                      eventId: schema.mediaLinks.eventId,
                      mediaId: schema.media.id,
                      kind: schema.media.kind,
                      mimeType: schema.media.mimeType,
                      originalFilename: schema.media.originalFilename,
                      caption: schema.mediaLinks.caption,
                      takenStart: schema.media.takenStart,
                  })
                  .from(schema.mediaLinks)
                  .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
                  .where(
                      and(
                          eq(schema.media.treeId, treeId),
                          inArray(
                              schema.mediaLinks.eventId,
                              events.map((event) => event.id),
                          ),
                      ),
                  )
                  .orderBy(asc(schema.mediaLinks.createdAt));

    const eventPhotos = events.map((event) =>
        eventRows
            .filter((row) => row.eventId === event.id)
            .map((photo) => ({
                mediaId: photo.mediaId,
                kind: photo.kind,
                mimeType: photo.mimeType,
                originalFilename: photo.originalFilename,
                eventType: event.typeCode,
                eventValue: event.value,
                caption: photo.caption,
                takenStart: photo.takenStart,
            })),
    );

    return [
        ...own.map((photo) => ({
            mediaId: photo.mediaId,
            kind: photo.kind,
            mimeType: photo.mimeType,
            originalFilename: photo.originalFilename,
            eventType: null,
            eventValue: null,
            caption: photo.caption,
            takenStart: photo.takenStart,
        })),
        ...eventPhotos.flat(),
    ];
}
