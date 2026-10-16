"use server";

/**
 * Familee - additional names and the other events of a person
 *
 * The primary name and the birth and death are edited on the person's form (see
 * actions/persons.ts). Here: the additional names (married name, nickname, a name in
 * another script) and every other event (occupation, residence, baptism...). Editors and
 * above write; every change goes to the audit log with the fields that changed.
 */

import { and, asc, eq, isNull, notInArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { clearedFields, diffFields, writeAudit } from "@/lib/audit";
import { loadDateWords } from "@/lib/date-words";
import { parseFuzzyDate } from "@/lib/fuzzy-date";
import { findPlaceInTree } from "@/lib/library";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type RecordResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The birth and the death are edited on the person's form, not as other events. */
const FORM_EVENTS = ["birth", "death"] as const;

async function editorFor(slug: string, personId: string) {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "auth.needSignIn" };
    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false as const, error: "auth.noPermission" };
    }
    if (!UUID.test(personId)) return { ok: false as const, error: "person.notFound" };

    const [person] = await db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(
            and(
                eq(schema.persons.id, personId),
                eq(schema.persons.treeId, access.treeId),
                isNull(schema.persons.deletedAt),
            ),
        )
        .limit(1);
    if (!person) return { ok: false as const, error: "person.notFound" };

    return { ok: true as const, treeId: access.treeId, userId: user.id };
}

// ─── additional names ────────────────────────────────────────────────────────

export type NameInput = {
    slug: string;
    personId: string;
    nameId: string | null;
    type: string;
    surname: string;
    given: string;
    patronymic: string;
    nickname: string;
};

const NAME_TYPES = [
    "birth",
    "married",
    "maiden",
    "also_known_as",
    "nickname",
    "religious",
    "immigrant",
    "legal",
] as const;

export async function saveNameAction(input: NameInput): Promise<RecordResult<{ nameId: string }>> {
    const access = await editorFor(input.slug, input.personId);
    if (!access.ok) return access;
    if (!(NAME_TYPES as readonly string[]).includes(input.type)) {
        return { ok: false, error: "validation.required" };
    }

    const values = {
        type: input.type as (typeof NAME_TYPES)[number],
        surname: input.surname.trim() || null,
        given: input.given.trim() || null,
        patronymic: input.patronymic.trim() || null,
        nickname: input.nickname.trim() || null,
        updatedAt: new Date(),
    };
    if (!values.surname && !values.given && !values.nickname) {
        return { ok: false, error: "validation.nameEmpty" };
    }

    if (input.nameId !== null) {
        if (!UUID.test(input.nameId)) return { ok: false, error: "validation.required" };
        const [before] = await db
            .select()
            .from(schema.personNames)
            .where(
                and(
                    eq(schema.personNames.id, input.nameId),
                    eq(schema.personNames.personId, input.personId),
                    eq(schema.personNames.isPrimary, false),
                ),
            )
            .limit(1);
        if (!before) return { ok: false, error: "person.notFound" };

        await db
            .update(schema.personNames)
            .set(values)
            .where(eq(schema.personNames.id, input.nameId));

        const changes = diffFields(
            {
                type: before.type,
                surname: before.surname,
                given: before.given,
                patronymic: before.patronymic,
                nickname: before.nickname,
            },
            {
                type: values.type,
                surname: values.surname,
                given: values.given,
                patronymic: values.patronymic,
                nickname: values.nickname,
            },
        );
        if (changes) {
            await writeAudit({
                treeId: access.treeId,
                userId: access.userId,
                action: "update",
                entityType: "person_name",
                entityId: input.nameId,
                changes,
            });
        }
        return { ok: true, nameId: input.nameId };
    }

    const [created] = await db
        .insert(schema.personNames)
        .values({ ...values, personId: input.personId, isPrimary: false })
        .returning({ id: schema.personNames.id });
    if (!created) return { ok: false, error: "validation.required" };

    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "create",
        entityType: "person_name",
        entityId: created.id,
        changes: diffFields(
            {},
            {
                type: values.type,
                surname: values.surname,
                given: values.given,
                patronymic: values.patronymic,
                nickname: values.nickname,
            },
        ),
    });
    return { ok: true, nameId: created.id };
}

export async function deleteNameAction(input: {
    slug: string;
    personId: string;
    nameId: string;
}): Promise<RecordResult> {
    const access = await editorFor(input.slug, input.personId);
    if (!access.ok) return access;
    if (!UUID.test(input.nameId)) return { ok: false, error: "person.notFound" };

    const deleted = await db
        .delete(schema.personNames)
        .where(
            and(
                eq(schema.personNames.id, input.nameId),
                eq(schema.personNames.personId, input.personId),
                eq(schema.personNames.isPrimary, false),
            ),
        )
        .returning({
            id: schema.personNames.id,
            type: schema.personNames.type,
            surname: schema.personNames.surname,
            given: schema.personNames.given,
            patronymic: schema.personNames.patronymic,
            nickname: schema.personNames.nickname,
        });
    const [removed] = deleted;
    if (!removed) return { ok: false, error: "person.notFound" };

    await writeAudit({
        treeId: access.treeId,
        userId: access.userId,
        action: "delete",
        entityType: "person_name",
        entityId: input.nameId,
        changes: clearedFields({
            type: removed.type,
            surname: removed.surname,
            given: removed.given,
            patronymic: removed.patronymic,
            nickname: removed.nickname,
        }),
    });
    return { ok: true };
}

// ─── other events ────────────────────────────────────────────────────────────

export type EventInput = {
    slug: string;
    personId: string;
    eventId: string | null;
    typeCode: string;
    value: string;
    description: string;
    date: string;
    placeId: string | null;
};

/** The event types a person can have on this form: all of them except birth and death. */
export async function listOtherEventTypes(): Promise<{ code: string; hasValue: boolean }[]> {
    return db
        .select({ code: schema.eventTypes.code, hasValue: schema.eventTypes.hasValue })
        .from(schema.eventTypes)
        .where(
            and(
                eq(schema.eventTypes.appliesTo, "person"),
                notInArray(schema.eventTypes.code, [...FORM_EVENTS]),
            ),
        )
        .orderBy(asc(schema.eventTypes.sortOrder), asc(schema.eventTypes.code));
}

export async function saveEventAction(
    input: EventInput,
): Promise<RecordResult<{ eventId: string }>> {
    const access = await editorFor(input.slug, input.personId);
    if (!access.ok) return access;

    const types = await listOtherEventTypes();
    const type = types.find((candidate) => candidate.code === input.typeCode);
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
        if (!UUID.test(input.eventId)) return { ok: false, error: "person.notFound" };
        const [before] = await db
            .select()
            .from(schema.events)
            .where(
                and(
                    eq(schema.events.id, input.eventId),
                    eq(schema.events.personId, input.personId),
                    notInArray(schema.events.typeCode, [...FORM_EVENTS]),
                ),
            )
            .limit(1);
        if (!before) return { ok: false, error: "person.notFound" };

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

    const [created] = await db
        .insert(schema.events)
        .values({
            ...values,
            treeId: access.treeId,
            personId: input.personId,
            isPrimary: false,
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

export async function deleteEventAction(input: {
    slug: string;
    personId: string;
    eventId: string;
}): Promise<RecordResult> {
    const access = await editorFor(input.slug, input.personId);
    if (!access.ok) return access;
    if (!UUID.test(input.eventId)) return { ok: false, error: "person.notFound" };

    const deleted = await db
        .delete(schema.events)
        .where(
            and(
                eq(schema.events.id, input.eventId),
                eq(schema.events.personId, input.personId),
                notInArray(schema.events.typeCode, [...FORM_EVENTS]),
            ),
        )
        .returning({
            id: schema.events.id,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            description: schema.events.description,
            date: schema.events.dateOriginal,
        });
    const [removed] = deleted;
    if (!removed) return { ok: false, error: "person.notFound" };

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
            date: removed.date,
        }),
    });
    return { ok: true };
}
