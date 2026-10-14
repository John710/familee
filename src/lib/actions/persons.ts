"use server";

/**
 * Familee - server actions for persons
 *
 * Writing needs the editor role or higher in the tree (see src/lib/roles.ts). The
 * person's primary name and the primary birth and death events are edited here
 * as a single form; the rest (more names, other events, unions) comes later.
 *
 * A death date is what makes a person deceased: the card shows the ribbon and
 * familee.derive_is_living() answers "not living". Nothing else is needed.
 */

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { diffFields, writeAudit } from "@/lib/audit";
import { loadDateWords } from "@/lib/date-words";
import { type ParsedDate, parseFuzzyDate } from "@/lib/fuzzy-date";
import { getPersonForEdit } from "@/lib/people";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type PersonResult<T extends object = object> =
    | ({ ok: true } & T)
    | { ok: false; error: string };

export type PersonInput = {
    slug: string;
    /** Set when editing; absent when creating. */
    personId?: string;
    surname: string;
    given: string;
    patronymic: string;
    sex: "male" | "female" | "unknown";
    birth: string;
    death: string;
    notes: string;
    /** The place of the birth and of the death, from the places of the tree; empty for none. */
    birthPlaceId?: string | null;
    deathPlaceId?: string | null;
};

const SEXES = ["male", "female", "unknown"] as const;

export async function createPersonAction(
    input: Omit<PersonInput, "personId">,
): Promise<PersonResult<{ personId: string }>> {
    return savePerson(input, null);
}

export async function updatePersonAction(input: PersonInput): Promise<PersonResult> {
    if (!input.personId) return { ok: false, error: "person.notFound" };
    const result = await savePerson(input, input.personId);
    return result.ok ? { ok: true } : result;
}

async function savePerson(
    input: Omit<PersonInput, "personId"> & { personId?: string },
    existingId: string | null,
): Promise<PersonResult<{ personId: string }>> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }

    const surname = input.surname.trim();
    const given = input.given.trim();
    const patronymic = input.patronymic.trim();
    if (surname === "" && given === "") {
        return { ok: false, error: "validation.nameEmpty" };
    }
    if (!(SEXES as readonly string[]).includes(input.sex)) {
        return { ok: false, error: "validation.required" };
    }

    const birth = parseFuzzyDate(input.birth, await loadDateWords());
    if (!birth.ok) return { ok: false, error: birth.error };
    const death = parseFuzzyDate(input.death, await loadDateWords());
    if (!death.ok) return { ok: false, error: death.error };

    if (birth.value && death.value && death.value.dateStart < birth.value.dateStart) {
        return { ok: false, error: "validation.dateRangeOrder" };
    }

    const notes = input.notes.trim() === "" ? null : input.notes.trim();

    // The places of the birth and the death: only places of this tree, and only with a date.
    const birthPlaceId = await treePlace(access.treeId, input.birthPlaceId);
    const deathPlaceId = await treePlace(access.treeId, input.deathPlaceId);

    // The values before the edit, for the diff in the audit log (an update only).
    const before = existingId === null ? null : await getPersonForEdit(access.treeId, existingId);

    const personId = await db.transaction(async (tx) => {
        let id: string;

        if (existingId === null) {
            const [created] = await tx
                .insert(schema.persons)
                .values({
                    treeId: access.treeId,
                    sex: input.sex,
                    notes,
                    createdBy: user.id,
                    updatedBy: user.id,
                })
                .returning({ id: schema.persons.id });
            if (!created) throw new Error("insert into persons returned no row");
            id = created.id;

            await tx.insert(schema.personNames).values({
                personId: id,
                type: "birth",
                isPrimary: true,
                surname: surname || null,
                given: given || null,
                patronymic: patronymic || null,
            });
        } else {
            id = existingId;
            const [updated] = await tx
                .update(schema.persons)
                .set({ sex: input.sex, notes, updatedBy: user.id, updatedAt: new Date() })
                .where(and(eq(schema.persons.id, id), eq(schema.persons.treeId, access.treeId)))
                .returning({ id: schema.persons.id });
            if (!updated) throw new Error("person not found in this tree");

            await tx
                .update(schema.personNames)
                .set({
                    surname: surname || null,
                    given: given || null,
                    patronymic: patronymic || null,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(schema.personNames.personId, id),
                        eq(schema.personNames.isPrimary, true),
                    ),
                );
        }

        await upsertLifeEvent(tx, access.treeId, id, "birth", birth.value, user.id, birthPlaceId);
        await upsertLifeEvent(tx, access.treeId, id, "death", death.value, user.id, deathPlaceId);

        return id;
    });

    if (before === null) {
        await writeAudit({
            treeId: access.treeId,
            userId: user.id,
            action: "create",
            entityType: "person",
            entityId: personId,
            changes: diffFields(
                {},
                {
                    surname,
                    given,
                    patronymic,
                    sex: input.sex,
                    birth: input.birth.trim(),
                    death: input.death.trim(),
                    notes,
                },
            ),
        });
    } else {
        const changes = diffFields(
            {
                surname: before.surname,
                given: before.given,
                patronymic: before.patronymic,
                sex: before.sex,
                birth: before.birthOriginal,
                death: before.deathOriginal,
                notes: before.notes,
            },
            {
                surname,
                given,
                patronymic,
                sex: input.sex,
                birth: input.birth.trim(),
                death: input.death.trim(),
                notes,
            },
        );
        // Saving without a change leaves no trace in the log.
        if (changes) {
            await writeAudit({
                treeId: access.treeId,
                userId: user.id,
                action: "update",
                entityType: "person",
                entityId: personId,
                changes,
            });
        }
    }

    return { ok: true, personId };
}

/**
 * Sets the primary birth or death event of a person. An empty date removes the
 * event; a date replaces the existing primary one (there is only one of each type).
 */
async function upsertLifeEvent(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    treeId: string,
    personId: string,
    typeCode: "birth" | "death",
    value: ParsedDate | null,
    userId: string,
    placeId: string | null,
) {
    const [existing] = await tx
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.personId, personId),
                eq(schema.events.typeCode, typeCode),
                eq(schema.events.isPrimary, true),
            ),
        )
        .limit(1);

    if (value === null) {
        if (existing) {
            await tx.delete(schema.events).where(eq(schema.events.id, existing.id));
        }
        return;
    }

    const fields = {
        dateQualifier: value.qualifier,
        datePrecision: value.precision,
        dateStart: value.dateStart,
        dateEnd: value.dateEnd,
        dateOriginal: value.original,
        placeId,
        updatedBy: userId,
        updatedAt: new Date(),
    };

    if (existing) {
        await tx.update(schema.events).set(fields).where(eq(schema.events.id, existing.id));
    } else {
        await tx.insert(schema.events).values({
            ...fields,
            treeId,
            personId,
            typeCode,
            isPrimary: true,
            createdBy: userId,
        });
    }
}

/** A place of this tree by its id, or null: a place of another tree is never taken. */
async function treePlace(
    treeId: string,
    placeId: string | null | undefined,
): Promise<string | null> {
    if (!placeId) return null;
    const [row] = await db
        .select({ id: schema.places.id })
        .from(schema.places)
        .where(and(eq(schema.places.id, placeId), eq(schema.places.treeId, treeId)))
        .limit(1);
    return row?.id ?? null;
}
