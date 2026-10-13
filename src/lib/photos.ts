/**
 * Familee - the photographs of a person: adding, choosing the main one, removing
 *
 * Not a server action: called from the upload route and from the server actions, after
 * the caller's role in the tree has been checked. A photograph is kept once per tree
 * (by its checksum) and can be linked to several people. Each person has at most one
 * main photograph: the one on the card in the tree (see familee.person_cards).
 */

import { createHash } from "node:crypto";
import { and, asc, desc, eq, ne } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import {
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
    | "members.notMember"
    | "person.notFound";

export type PersonPhoto = {
    mediaId: string;
    isPrimary: boolean;
    width: number | null;
    height: number | null;
};

/** The photographs of a person, the main one first. */
export async function listPersonPhotos(treeId: string, personId: string): Promise<PersonPhoto[]> {
    return db
        .select({
            mediaId: schema.media.id,
            isPrimary: schema.mediaLinks.isPrimary,
            width: schema.media.width,
            height: schema.media.height,
        })
        .from(schema.mediaLinks)
        .innerJoin(schema.media, eq(schema.media.id, schema.mediaLinks.mediaId))
        .where(and(eq(schema.mediaLinks.personId, personId), eq(schema.media.treeId, treeId)))
        .orderBy(desc(schema.mediaLinks.isPrimary), asc(schema.mediaLinks.createdAt));
}

async function personInTree(treeId: string, personId: string): Promise<boolean> {
    const [row] = await db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(and(eq(schema.persons.id, personId), eq(schema.persons.treeId, treeId)))
        .limit(1);
    return row !== undefined;
}

/** Adds a photograph to a person. The same file again is only linked, not stored twice. */
export async function addPersonPhoto(input: {
    treeId: string;
    personId: string;
    userId: string;
    source: Buffer;
    originalFilename: string | null;
}): Promise<{ ok: true; mediaId: string } | { ok: false; error: PhotoError }> {
    if (!(await personInTree(input.treeId, input.personId))) {
        return { ok: false, error: "person.notFound" };
    }

    const checksum = createHash("sha256").update(input.source).digest("hex");

    const [existing] = await db
        .select({ id: schema.media.id })
        .from(schema.media)
        .where(
            and(eq(schema.media.treeId, input.treeId), eq(schema.media.checksumSha256, checksum)),
        )
        .limit(1);

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
    const becomesMain = mainLink === undefined;

    if (existing) {
        const [linked] = await db
            .select({ id: schema.mediaLinks.id })
            .from(schema.mediaLinks)
            .where(
                and(
                    eq(schema.mediaLinks.mediaId, existing.id),
                    eq(schema.mediaLinks.personId, input.personId),
                ),
            )
            .limit(1);
        if (linked) return { ok: false, error: "media.errors.duplicate" };

        await db.insert(schema.mediaLinks).values({
            mediaId: existing.id,
            personId: input.personId,
            role: becomesMain ? "portrait" : "gallery",
            isPrimary: becomesMain,
        });
        return { ok: true, mediaId: existing.id };
    }

    const processed = await processPhoto(input.source);
    if (!processed.ok) return processed;
    const photo = processed.photo;

    const keys = variantKeys(input.treeId, checksum);
    const written: string[] = [];
    try {
        for (const name of Object.keys(keys) as MediaVariantName[]) {
            await writeMediaFile(keys[name], photo.variants[name].data);
            written.push(keys[name]);
        }
    } catch {
        await removeMediaFiles(written);
        return { ok: false, error: "media.errors.failed" };
    }

    try {
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
                    uploadedBy: input.userId,
                })
                .returning({ id: schema.media.id });
            if (!created) throw new Error("insert returned no row");

            await tx.insert(schema.mediaVariants).values(
                (Object.keys(keys) as MediaVariantName[]).map((name) => ({
                    mediaId: created.id,
                    variant: name,
                    format: "webp",
                    storageKey: keys[name],
                    width: photo.variants[name].width,
                    height: photo.variants[name].height,
                    byteSize: photo.variants[name].data.length,
                })),
            );

            await tx.insert(schema.mediaLinks).values({
                mediaId: created.id,
                personId: input.personId,
                role: becomesMain ? "portrait" : "gallery",
                isPrimary: becomesMain,
            });

            return created.id;
        });

        await writeAudit({
            treeId: input.treeId,
            userId: input.userId,
            action: "create",
            entityType: "media",
            entityId: mediaId,
        });
        return { ok: true, mediaId };
    } catch {
        await removeMediaFiles(written);
        return { ok: false, error: "media.errors.failed" };
    }
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

    const updated = await db.transaction(async (tx) => {
        const [link] = await tx
            .select({ id: schema.mediaLinks.id })
            .from(schema.mediaLinks)
            .where(
                and(
                    eq(schema.mediaLinks.mediaId, input.mediaId),
                    eq(schema.mediaLinks.personId, input.personId),
                ),
            )
            .limit(1);
        if (!link) return false;

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
        return true;
    });

    if (!updated) return { ok: false, error: "media.errors.failed" };

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "update",
        entityType: "person_photo",
        entityId: input.personId,
    });
    return { ok: true };
}

/**
 * Takes a photograph off a person. If it was the main one, the newest remaining photograph
 * becomes the main one. A photograph that nobody has any more is deleted with its files.
 */
export async function removePersonPhoto(input: {
    treeId: string;
    personId: string;
    mediaId: string;
    userId: string;
}): Promise<{ ok: true } | { ok: false; error: PhotoError }> {
    if (!(await personInTree(input.treeId, input.personId))) {
        return { ok: false, error: "person.notFound" };
    }

    const orphanKeys = await db.transaction(async (tx) => {
        const [removed] = await tx
            .delete(schema.mediaLinks)
            .where(
                and(
                    eq(schema.mediaLinks.mediaId, input.mediaId),
                    eq(schema.mediaLinks.personId, input.personId),
                ),
            )
            .returning({ wasMain: schema.mediaLinks.isPrimary });
        if (!removed) return null;

        if (removed.wasMain) {
            const [next] = await tx
                .select({ id: schema.mediaLinks.id })
                .from(schema.mediaLinks)
                .where(eq(schema.mediaLinks.personId, input.personId))
                .orderBy(desc(schema.mediaLinks.createdAt))
                .limit(1);
            if (next) {
                await tx
                    .update(schema.mediaLinks)
                    .set({ isPrimary: true, role: "portrait", updatedAt: new Date() })
                    .where(eq(schema.mediaLinks.id, next.id));
            }
        }

        const [stillUsed] = await tx
            .select({ id: schema.mediaLinks.id })
            .from(schema.mediaLinks)
            .where(eq(schema.mediaLinks.mediaId, input.mediaId))
            .limit(1);
        if (stillUsed) return [];

        const variants = await tx
            .select({ key: schema.mediaVariants.storageKey })
            .from(schema.mediaVariants)
            .where(eq(schema.mediaVariants.mediaId, input.mediaId));
        await tx.delete(schema.media).where(eq(schema.media.id, input.mediaId));
        return variants.map((variant) => variant.key);
    });

    if (orphanKeys === null) return { ok: false, error: "media.errors.failed" };
    if (orphanKeys.length > 0) await removeMediaFiles(orphanKeys);

    await writeAudit({
        treeId: input.treeId,
        userId: input.userId,
        action: "delete",
        entityType: "person_photo",
        entityId: input.personId,
    });
    return { ok: true };
}

/** The file of one variant of a photograph in the tree, or null when there is none. */
export async function findVariantKey(
    treeId: string,
    mediaId: string,
    variant: MediaVariantName,
): Promise<string | null> {
    const [row] = await db
        .select({ key: schema.mediaVariants.storageKey })
        .from(schema.mediaVariants)
        .innerJoin(schema.media, eq(schema.media.id, schema.mediaVariants.mediaId))
        .where(
            and(
                eq(schema.mediaVariants.mediaId, mediaId),
                eq(schema.mediaVariants.variant, variant),
                eq(schema.media.treeId, treeId),
            ),
        )
        .limit(1);
    return row?.key ?? null;
}
