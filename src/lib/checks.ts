/**
 * Familee - reading the archive for the page of doubtful data
 *
 * The rules live in src/lib/data-checks.ts and know nothing of the database; this module gathers
 * what they need from one tree - the people, the parent edges, the unions and the number of vital
 * events - and hands it over. It also answers the names, so the page can link each remark to the
 * cards it is about.
 *
 * Not a server action: called from the page after the caller's access to the tree has been checked.
 */

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { todayIn } from "@/lib/age";
import {
    type CheckDate,
    type CheckInput,
    type CheckIssue,
    findDataProblems,
} from "@/lib/data-checks";

export type CheckReport = {
    issues: CheckIssue[];
    /** The name of every person, by identifier, for the links and the sentences. */
    names: Map<string, string>;
};

/** The dates of one life event as the rules want them. */
function date(
    start: string | null,
    end: string | null,
    qualifier: string | null,
    precision: string | null,
): CheckDate {
    return { start, end, qualifier, precision };
}

/**
 * Everything doubtful in one tree, and the names to show it with. The list is read whole rather than
 * paged: a family archive is thousands of people at most, and a remark is only useful beside the
 * next one.
 */
export async function listDataProblems(treeId: string): Promise<CheckReport> {
    const cards = await db
        .select({
            personId: schema.personCards.personId,
            fullName: schema.personCards.fullName,
            sex: schema.personCards.sex,
            isLiving: schema.personCards.isLiving,
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
        .where(eq(schema.personCards.treeId, treeId));

    const names = new Map(cards.map((card) => [card.personId, card.fullName ?? ""]));

    const edges = await db
        .select({ parentId: schema.parentChild.parentId, childId: schema.parentChild.childId })
        .from(schema.parentChild)
        .where(eq(schema.parentChild.treeId, treeId));

    const partnerRows = await db
        .select({
            familyId: schema.familyPartners.familyId,
            personId: schema.familyPartners.personId,
        })
        .from(schema.familyPartners)
        .where(eq(schema.familyPartners.treeId, treeId));

    const partnersOf = new Map<string, string[]>();
    for (const row of partnerRows) {
        // The cards are the people outside the trash; a trashed partner is not a partner here.
        if (!names.has(row.personId)) continue;
        partnersOf.set(row.familyId, [...(partnersOf.get(row.familyId) ?? []), row.personId]);
    }

    const marriageRows = await db
        .select({
            familyId: schema.events.familyId,
            dateStart: schema.events.dateStart,
            dateEnd: schema.events.dateEnd,
            dateQualifier: schema.events.dateQualifier,
            datePrecision: schema.events.datePrecision,
        })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.treeId, treeId),
                isNotNull(schema.events.familyId),
                eq(schema.events.typeCode, "marriage"),
            ),
        );

    const marriageOf = new Map<string, CheckDate>();
    for (const row of marriageRows) {
        if (row.familyId) {
            marriageOf.set(
                row.familyId,
                date(row.dateStart, row.dateEnd, row.dateQualifier, row.datePrecision),
            );
        }
    }

    const unions = [...partnersOf].map(([familyId, partnerIds]) => ({
        familyId,
        partnerIds,
        marriage: marriageOf.get(familyId) ?? date(null, null, null, null),
    }));

    // How many birth and death events each person carries: more than one of either is a sign of an
    // import that ran twice or of a hand that typed the same record again.
    const vitalRows = await db
        .select({
            personId: schema.events.personId,
            births: sql<number>`count(*) filter (where ${schema.events.typeCode} = 'birth')`.mapWith(
                Number,
            ),
            deaths: sql<number>`count(*) filter (where ${schema.events.typeCode} = 'death')`.mapWith(
                Number,
            ),
        })
        .from(schema.events)
        // A person in the trash keeps their events, but they are not part of the archive any more.
        .innerJoin(schema.persons, eq(schema.persons.id, schema.events.personId))
        .where(
            and(
                eq(schema.events.treeId, treeId),
                isNull(schema.persons.deletedAt),
                inArray(schema.events.typeCode, ["birth", "death"]),
            ),
        )
        .groupBy(schema.events.personId);

    const input: CheckInput = {
        persons: cards.map((card) => ({
            personId: card.personId,
            name: card.fullName,
            sex: card.sex,
            isLiving: card.isLiving,
            birth: date(
                card.birthDate,
                card.birthDateEnd,
                card.birthQualifier,
                card.birthPrecision,
            ),
            death: date(
                card.deathDate,
                card.deathDateEnd,
                card.deathQualifier,
                card.deathPrecision,
            ),
        })),
        edges,
        unions,
        vitalCounts: vitalRows.flatMap((row) =>
            row.personId
                ? [{ personId: row.personId, births: row.births, deaths: row.deaths }]
                : [],
        ),
        today: todayIn(),
    };

    return { issues: findDataProblems(input), names };
}
