"use server";

/**
 * Familee - the events of a union: the marriage, the divorce, the day the two parted
 *
 * A union's events live in the same table as a person's, with family_id instead of person_id (see
 * db/schema/events.ts), and until now nothing could write them: the GEDCOM import brought a marriage
 * in and there was no way to read, correct or remove it. Editors and above write here; the message
 * of a database check is mapped to a translation key, and every change goes to the audit log.
 */

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { clearedFields, diffFields, writeAudit } from "@/lib/audit";
import { loadDateWords } from "@/lib/date-words";
import { parseFuzzyDate } from "@/lib/fuzzy-date";
import { findPlaceInTree } from "@/lib/library";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { listFamilyEventTypes } from "@/lib/unions";

export type FamilyEventResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The editor of this tree, and the union, which must be one of its own. */
async function editorFor(slug: string, familyId: string) {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "auth.needSignIn" };

    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false as const, error: "auth.noPermission" };
    }
    if (!UUID.test(familyId)) return { ok: false as const, error: "family.notFound" };

    const [family] = await db
        .select({ id: schema.families.id })
        .from(schema.families)
        .where(and(eq(schema.families.id, familyId), eq(schema.families.treeId, access.treeId)))
        .limit(1);
    if (!family) return { ok: false as const, error: "family.notFound" };

    return { ok: true as const, treeId: access.treeId, userId: user.id };
}

export type FamilyEventInput = {
    slug: string;
    familyId: string;
    /** The event being corrected, or null for a new one. */
    eventId: string | null;
    typeCode: string;
    value: string;
    description: string;
    date: string;
    placeId: string | null;
};

/** Adds an event to a union, or corrects one of its own. */
export async function saveFamilyEventAction(
    input: FamilyEventInput,
): Promise<FamilyEventResult<{ eventId: string }>> {
    const access = await editorFor(input.slug, input.familyId);
    if (!access.ok) return access;

    const type = (await listFamilyEventTypes()).find(
        (candidate) => candidate.code === input.typeCode,
    );
    if (!type) return { ok: false, error: "validation.required" };

    const date = parseFuzzyDate(input.date, await loadDateWords());
    if (!date.ok) return { ok: false, error: date.error };

    const values = {
        typeCode: type.code,
        value: type.hasValue && input.value.trim() ? input.value.trim() : null,
        description: input.description.trim() || null,
        placeId: await findPlaceInTree(access.treeId, input.placeId),
        dateQualifier: date.value?.qualifier ?? ("unknown" as const),
        datePrecision: date.value?.precision ?? ("day" as const),
        dateStart: date.value?.dateStart ?? null,
        dateEnd: date.value?.dateEnd ?? null,
        dateOriginal: date.value?.original ?? null,
        updatedBy: access.userId,
        updatedAt: new Date(),
    };

    if (input.eventId !== null) {
        if (!UUID.test(input.eventId)) return { ok: false, error: "family.notFound" };
        const [before] = await db
            .select()
            .from(schema.events)
            .where(
                and(
                    eq(schema.events.id, input.eventId),
                    eq(schema.events.familyId, input.familyId),
                    eq(schema.events.treeId, access.treeId),
                ),
            )
            .limit(1);
        if (!before) return { ok: false, error: "family.notFound" };

        await db.update(schema.events).set(values).where(eq(schema.events.id, input.eventId));

        const changes = diffFields(
            {
                typeCode: before.typeCode,
                value: before.value,
                description: before.description,
                date: before.dateOriginal,
                placeId: before.placeId,
            },
            {
                typeCode: values.typeCode,
                value: values.value,
                description: values.description,
                date: values.dateOriginal,
                placeId: values.placeId,
            },
        );
        if (changes) {
            await writeAudit({
                treeId: access.treeId,
                userId: access.userId,
                action: "update",
                entityType: "event",
                entityId: input.eventId,
                changes,
            });
        }
        return { ok: true, eventId: input.eventId };
    }

    // A union carries one primary event of each vital type (the database keeps it unique): the
    // marriage, the divorce. The first one written becomes the primary; a later one joins it.
    const existing = await db
        .select({ typeCode: schema.events.typeCode, isPrimary: schema.events.isPrimary })
        .from(schema.events)
        .where(eq(schema.events.familyId, input.familyId));
    const isPrimary =
        type.isVital &&
        !existing.some((event) => event.isPrimary && event.typeCode === values.typeCode);

    const [created] = await db
        .insert(schema.events)
        .values({
            ...values,
            treeId: access.treeId,
            familyId: input.familyId,
            isPrimary,
            createdBy: access.userId,
        })
        .returning({ id: schema.events.id });
    if (!created) return { ok: false, error: "validation.required" };

    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "create",
        entityType: "event",
        entityId: created.id,
        changes: diffFields(
            {},
            {
                typeCode: values.typeCode,
                value: values.value,
                description: values.description,
                date: values.dateOriginal,
            },
        ),
    });
    return { ok: true, eventId: created.id };
}

/** Takes an event off a union. Its citations go with it (the database cascades them). */
export async function deleteFamilyEventAction(input: {
    slug: string;
    familyId: string;
    eventId: string;
}): Promise<FamilyEventResult> {
    const access = await editorFor(input.slug, input.familyId);
    if (!access.ok) return access;
    if (!UUID.test(input.eventId)) return { ok: false, error: "family.notFound" };

    const deleted = await db
        .delete(schema.events)
        .where(
            and(
                eq(schema.events.id, input.eventId),
                eq(schema.events.familyId, input.familyId),
                eq(schema.events.treeId, access.treeId),
            ),
        )
        .returning({
            id: schema.events.id,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            description: schema.events.description,
            dateOriginal: schema.events.dateOriginal,
            placeId: schema.events.placeId,
        });
    const [removed] = deleted;
    if (!removed) return { ok: false, error: "family.notFound" };

    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "delete",
        entityType: "event",
        entityId: input.eventId,
        changes: clearedFields({
            typeCode: removed.typeCode,
            value: removed.value,
            description: removed.description,
            date: removed.dateOriginal,
            placeId: removed.placeId,
        }),
    });
    return { ok: true };
}
