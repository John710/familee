/**
 * Familee - the data of a tree in the shape the GEDCOM writer takes
 *
 * Reads the persons (the primary name and the life dates from familee.person_cards,
 * the notes from persons), the unions with their partners and children, and the
 * marriage dates. Identifiers are numbered per file (@I1@…, @F1@…): the database
 * keys are not written to the file.
 */

import { and, asc, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ExportPerson, ExportUnion, GedDate } from "@/lib/gedcom-export";

type Qualifier = GedDate["qualifier"];
type Precision = GedDate["precision"];

function dateOf(
    start: string | null,
    end: string | null,
    qualifier: string | null,
    precision: string | null,
): GedDate | null {
    if (!start || !qualifier || !precision) return null;
    return {
        qualifier: qualifier as Qualifier,
        precision: precision as Precision,
        start,
        end,
    };
}

export async function loadTreeForExport(treeId: string): Promise<{
    persons: ExportPerson[];
    unions: ExportUnion[];
}> {
    const cards = await db
        .select({
            personId: schema.personCards.personId,
            surname: schema.personCards.surname,
            given: schema.personCards.given,
            patronymic: schema.personCards.patronymic,
            sex: schema.personCards.sex,
            birthDate: schema.personCards.birthDate,
            birthDateEnd: schema.personCards.birthDateEnd,
            birthQualifier: schema.personCards.birthQualifier,
            birthPrecision: schema.personCards.birthPrecision,
            deathDate: schema.personCards.deathDate,
            deathDateEnd: schema.personCards.deathDateEnd,
            deathQualifier: schema.personCards.deathQualifier,
            deathPrecision: schema.personCards.deathPrecision,
        })
        .from(schema.personCards)
        .where(eq(schema.personCards.treeId, treeId))
        .orderBy(asc(schema.personCards.sortOrder), asc(schema.personCards.fullName));

    const notes = await db
        .select({ id: schema.persons.id, notes: schema.persons.notes })
        .from(schema.persons)
        .where(eq(schema.persons.treeId, treeId));
    const notesOf = new Map(notes.map((row) => [row.id, row.notes ?? ""]));

    const xrefOf = new Map<string, string>();
    cards.forEach((card, index) => xrefOf.set(card.personId, `@I${index + 1}@`));

    const persons: ExportPerson[] = cards.map((card) => ({
        xref: xrefOf.get(card.personId) ?? "@I0@",
        surname: card.surname ?? "",
        given: card.given ?? "",
        patronymic: card.patronymic ?? "",
        sex: card.sex,
        birth: dateOf(card.birthDate, card.birthDateEnd, card.birthQualifier, card.birthPrecision),
        death: dateOf(card.deathDate, card.deathDateEnd, card.deathQualifier, card.deathPrecision),
        notes: notesOf.get(card.personId) ?? "",
    }));

    const sexOf = new Map(cards.map((card) => [card.personId, card.sex]));

    const families = await db
        .select({ id: schema.families.id })
        .from(schema.families)
        .where(eq(schema.families.treeId, treeId))
        .orderBy(asc(schema.families.createdAt));

    const partnerRows = await db
        .select({ familyId: schema.familyPartners.familyId, personId: schema.familyPartners.personId })
        .from(schema.familyPartners)
        .where(eq(schema.familyPartners.treeId, treeId))
        .orderBy(asc(schema.familyPartners.sortOrder));

    const childRows = await db
        .select({
            familyId: schema.familyChildren.familyId,
            personId: schema.familyChildren.personId,
            birthOrder: schema.familyChildren.birthOrder,
        })
        .from(schema.familyChildren)
        .where(eq(schema.familyChildren.treeId, treeId))
        .orderBy(asc(schema.familyChildren.birthOrder));

    const marriageRows = await db
        .select({
            familyId: schema.events.familyId,
            dateStart: schema.events.dateStart,
            dateEnd: schema.events.dateEnd,
            qualifier: schema.events.dateQualifier,
            precision: schema.events.datePrecision,
        })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.treeId, treeId),
                eq(schema.events.typeCode, "marriage"),
                eq(schema.events.isPrimary, true),
                isNotNull(schema.events.familyId),
            ),
        );

    const xrefOfFamily = new Map<string, string>();
    families.forEach((family, index) => xrefOfFamily.set(family.id, `@F${index + 1}@`));

    const unions: ExportUnion[] = families.map((family) => {
        const partners = partnerRows
            .filter((row) => row.familyId === family.id && xrefOf.has(row.personId))
            .map((row) => ({
                xref: xrefOf.get(row.personId) ?? "@I0@",
                sex: sexOf.get(row.personId) ?? ("unknown" as const),
            }));
        const children = childRows
            .filter((row) => row.familyId === family.id && xrefOf.has(row.personId))
            .map((row) => xrefOf.get(row.personId) ?? "@I0@");
        const marriage = marriageRows.find((row) => row.familyId === family.id);
        return {
            xref: xrefOfFamily.get(family.id) ?? "@F0@",
            partners,
            children,
            marriage: marriage
                ? dateOf(marriage.dateStart, marriage.dateEnd, marriage.qualifier, marriage.precision)
                : null,
        };
    });

    return { persons, unions };
}
