/**
 * Familee - reading persons
 *
 * Not a server action: called from server components after the caller's access
 * to the tree has been checked. The cards come from familee.person_cards, which
 * already computes the display name, the years and the living flag.
 */

import { and, asc, eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";

/** The persons of a tree in the order of the list: by birth, then by name. */
export async function listPersonCards(treeId: string) {
    return db
        .select({
            personId: schema.personCards.personId,
            fullName: schema.personCards.fullName,
            sex: schema.personCards.sex,
            birthYear: schema.personCards.birthYear,
            deathYear: schema.personCards.deathYear,
            isLiving: schema.personCards.isLiving,
        })
        .from(schema.personCards)
        .where(eq(schema.personCards.treeId, treeId))
        .orderBy(
            sql`${schema.personCards.birthDate} nulls last`,
            asc(schema.personCards.fullName),
        );
}

/** One person for the editing form: the primary name, the sex, the notes and the two life events. */
export async function getPersonForEdit(treeId: string, personId: string) {
    const [card] = await db
        .select({
            personId: schema.personCards.personId,
            surname: schema.personCards.surname,
            given: schema.personCards.given,
            patronymic: schema.personCards.patronymic,
            sex: schema.personCards.sex,
            birthOriginal: schema.personCards.birthOriginal,
            deathOriginal: schema.personCards.deathOriginal,
            isLiving: schema.personCards.isLiving,
        })
        .from(schema.personCards)
        .where(
            and(
                eq(schema.personCards.treeId, treeId),
                eq(schema.personCards.personId, personId),
            ),
        )
        .limit(1);

    if (!card) return null;

    const [person] = await db
        .select({ notes: schema.persons.notes })
        .from(schema.persons)
        .where(eq(schema.persons.id, personId))
        .limit(1);

    return { ...card, notes: person?.notes ?? "" };
}
