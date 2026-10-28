/**
 * Familee - the data of a tree in the shape the GEDCOM writer takes
 *
 * Reads the persons (the primary name and the life dates from familee.person_cards,
 * the notes from persons), the unions with their partners and children, and the
 * marriage dates. Identifiers are numbered per file (@I1@…, @F1@…): the database
 * keys are not written to the file.
 */

import { and, asc, desc, eq, isNotNull, notInArray } from "drizzle-orm";

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

    // person_cards has no suffix of its own (it is part of the full name), so it is read from the
    // primary name.
    const suffixes = await db
        .select({ personId: schema.personNames.personId, suffix: schema.personNames.suffix })
        .from(schema.personNames)
        .innerJoin(schema.persons, eq(schema.persons.id, schema.personNames.personId))
        .where(
            and(
                eq(schema.persons.treeId, treeId),
                eq(schema.personNames.isPrimary, true),
                isNotNull(schema.personNames.suffix),
            ),
        );
    const suffixOf = new Map(suffixes.map((row) => [row.personId, row.suffix?.trim() ?? ""]));

    const xrefOf = new Map<string, string>();
    cards.forEach((card, index) => {
        xrefOf.set(card.personId, `@I${index + 1}@`);
    });

    // The other events of the persons: every event that is not the primary birth or death.
    const eventRows = await db
        .select({
            personId: schema.events.personId,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            description: schema.events.description,
            dateStart: schema.events.dateStart,
            dateEnd: schema.events.dateEnd,
            qualifier: schema.events.dateQualifier,
            precision: schema.events.datePrecision,
            gedcomTag: schema.eventTypes.gedcomTag,
        })
        .from(schema.events)
        .innerJoin(schema.eventTypes, eq(schema.eventTypes.code, schema.events.typeCode))
        .where(
            and(
                eq(schema.events.treeId, treeId),
                isNotNull(schema.events.personId),
                notInArray(schema.events.typeCode, ["birth", "death"]),
            ),
        )
        .orderBy(asc(schema.events.sortDate), asc(schema.events.createdAt));

    const persons: ExportPerson[] = cards.map((card) => ({
        xref: xrefOf.get(card.personId) ?? "@I0@",
        surname: card.surname ?? "",
        given: card.given ?? "",
        patronymic: card.patronymic ?? "",
        suffix: suffixOf.get(card.personId) ?? "",
        sex: card.sex,
        birth: dateOf(card.birthDate, card.birthDateEnd, card.birthQualifier, card.birthPrecision),
        death: dateOf(card.deathDate, card.deathDateEnd, card.deathQualifier, card.deathPrecision),
        notes: notesOf.get(card.personId) ?? "",
        events: eventRows
            .filter((row) => row.personId === card.personId)
            .map((row) => ({
                tag: row.gedcomTag,
                typeCode: row.typeCode,
                value: row.value,
                description: row.description ?? "",
                date: dateOf(row.dateStart, row.dateEnd, row.qualifier, row.precision),
            })),
    }));

    const sexOf = new Map(cards.map((card) => [card.personId, card.sex]));

    const families = await db
        .select({ id: schema.families.id })
        .from(schema.families)
        .where(eq(schema.families.treeId, treeId))
        .orderBy(asc(schema.families.createdAt));

    const partnerRows = await db
        .select({
            familyId: schema.familyPartners.familyId,
            personId: schema.familyPartners.personId,
        })
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

    // Every marriage of a union (a couple may marry twice, or civilly and in church), the
    // primary one first: the importer of most programs reads the first MARR as the marriage.
    const marriageRows = await db
        .select({
            familyId: schema.events.familyId,
            description: schema.events.description,
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
                isNotNull(schema.events.familyId),
            ),
        )
        .orderBy(
            desc(schema.events.isPrimary),
            asc(schema.events.sortDate),
            asc(schema.events.createdAt),
        );

    const xrefOfFamily = new Map<string, string>();
    families.forEach((family, index) => {
        xrefOfFamily.set(family.id, `@F${index + 1}@`);
    });

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
        const marriages = marriageRows
            .filter((row) => row.familyId === family.id)
            .map((row) => ({
                date: dateOf(row.dateStart, row.dateEnd, row.qualifier, row.precision),
                description: row.description ?? "",
            }));
        return {
            xref: xrefOfFamily.get(family.id) ?? "@F0@",
            partners,
            children,
            marriages,
        };
    });

    // A union of children whose parents are both unknown is still a family (a FAM record with
    // only CHIL lines is valid GEDCOM): it keeps the siblings together. Only a union with nobody
    // left in it - every member deleted - is not written.
    return {
        persons,
        unions: unions.filter((union) => union.partners.length > 0 || union.children.length > 0),
    };
}
