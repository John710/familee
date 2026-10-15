/**
 * Familee - reading persons
 *
 * Not a server action: called from server components after the caller's access
 * to the tree has been checked. The cards come from familee.person_cards, which
 * already computes the display name, the years and the living flag.
 */

import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db, schema } from "@/db";

/** The persons of a tree in the order of the list: by birth, then by name. */
export async function listPersonCards(treeId: string) {
    return db
        .select({
            personId: schema.personCards.personId,
            fullName: schema.personCards.fullName,
            surname: schema.personCards.surname,
            given: schema.personCards.given,
            patronymic: schema.personCards.patronymic,
            sex: schema.personCards.sex,
            birthYear: schema.personCards.birthYear,
            deathYear: schema.personCards.deathYear,
            isLiving: schema.personCards.isLiving,
            birthDate: schema.personCards.birthDate,
            birthPrecision: schema.personCards.birthPrecision,
            deathDate: schema.personCards.deathDate,
            deathPrecision: schema.personCards.deathPrecision,
            portraitMediaId: schema.personCards.portraitMediaId,
            portraitWidth: schema.personCards.portraitWidth,
            portraitHeight: schema.personCards.portraitHeight,
            cropX: schema.personCards.cropX,
            cropY: schema.personCards.cropY,
            cropW: schema.personCards.cropW,
            cropH: schema.personCards.cropH,
        })
        .from(schema.personCards)
        .where(eq(schema.personCards.treeId, treeId))
        .orderBy(sql`${schema.personCards.birthDate} nulls last`, asc(schema.personCards.fullName));
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
            and(eq(schema.personCards.treeId, treeId), eq(schema.personCards.personId, personId)),
        )
        .limit(1);

    if (!card) return null;

    const [person] = await db
        .select({ notes: schema.persons.notes })
        .from(schema.persons)
        .where(eq(schema.persons.id, personId))
        .limit(1);

    // The places of the birth and the death are kept on those primary events.
    const lifeEvents = await db
        .select({ typeCode: schema.events.typeCode, placeId: schema.events.placeId })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.personId, personId),
                eq(schema.events.isPrimary, true),
                inArray(schema.events.typeCode, ["birth", "death"]),
            ),
        );
    const birthPlaceId = lifeEvents.find((event) => event.typeCode === "birth")?.placeId ?? null;
    const deathPlaceId = lifeEvents.find((event) => event.typeCode === "death")?.placeId ?? null;

    // The suffix is not in the card view; it is read from the primary name.
    const [primaryName] = await db
        .select({ suffix: schema.personNames.suffix })
        .from(schema.personNames)
        .where(
            and(eq(schema.personNames.personId, personId), eq(schema.personNames.isPrimary, true)),
        )
        .limit(1);

    return {
        ...card,
        suffix: primaryName?.suffix ?? "",
        notes: person?.notes ?? "",
        birthPlaceId,
        deathPlaceId,
    };
}

/** The additional names of a person: every name except the primary one (edited on the form). */
export async function listAdditionalNames(personId: string) {
    return db
        .select({
            id: schema.personNames.id,
            type: schema.personNames.type,
            surname: schema.personNames.surname,
            given: schema.personNames.given,
            patronymic: schema.personNames.patronymic,
            nickname: schema.personNames.nickname,
        })
        .from(schema.personNames)
        .where(
            and(eq(schema.personNames.personId, personId), eq(schema.personNames.isPrimary, false)),
        )
        .orderBy(asc(schema.personNames.createdAt));
}

/** The events of a person other than the primary birth and death (edited on the form). */
export async function listOtherEvents(personId: string) {
    return db
        .select({
            id: schema.events.id,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            description: schema.events.description,
            dateOriginal: schema.events.dateOriginal,
            placeId: schema.events.placeId,
            placeName: schema.places.name,
        })
        .from(schema.events)
        .leftJoin(schema.places, eq(schema.places.id, schema.events.placeId))
        .where(
            and(
                eq(schema.events.personId, personId),
                notInArray(schema.events.typeCode, ["birth", "death"]),
            ),
        )
        .orderBy(asc(schema.events.sortDate), asc(schema.events.createdAt));
}
