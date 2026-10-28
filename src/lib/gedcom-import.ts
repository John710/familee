/**
 * Familee - writing a GEDCOM import into a tree
 *
 * Takes the plan from src/lib/gedcom-plan.ts and writes it in one transaction: the
 * persons with their primary names and life events, the unions with their partners,
 * children and marriage dates. The identifiers of the file (@I1@, @F1@) are kept in
 * gedcom_xref. When the tree already holds a person or a union with one of those
 * identifiers, the import stops: records of two files must not be merged by accident.
 * A person of the file who is clearly somebody already in the tree (sameForImport in
 * src/lib/duplicates.ts) is joined to that record instead of being created again.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { pedigreeErrorKey } from "@/lib/db-errors";
import { cardToDuplicate, type DuplicatePerson, importJoins, yearOf } from "@/lib/duplicates";
import { type DateWords, type ParsedDate, parseFuzzyDate } from "@/lib/fuzzy-date";
import type { ImportPlan, PlannedPerson } from "@/lib/gedcom-plan";
import { listPersonCards } from "@/lib/people";

export type ImportResult =
    | {
          ok: true;
          persons: number;
          unions: number;
          children: number;
          events: number;
          /** The people of the file who were joined to a person already in the tree. */
          joined: number;
      }
    | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function importIntoTree(input: {
    treeId: string;
    userId: string;
    plan: ImportPlan;
    /** The date words of the request's locale, for the dates the file holds. */
    words: DateWords;
}): Promise<ImportResult> {
    const { treeId, userId, plan, words } = input;

    // The caller shows the refusals of the plan; a plan with any of them is never written.
    if (plan.refusals.length > 0) return { ok: false, error: "gedcom.refused" };

    // The identifiers of the file, as the tree already knows them: a person carries the identifier
    // of his own record, and person_xrefs holds the identifiers of duplicates that were merged into
    // somebody. Either of them means the file has been here already.
    const fileXrefs = plan.persons.map((person) => person.xref);
    const existingPersons = await db
        .select({ xref: schema.persons.gedcomXref })
        .from(schema.persons)
        .where(
            and(eq(schema.persons.treeId, treeId), inArray(schema.persons.gedcomXref, fileXrefs)),
        );
    const existingAliases = await db
        .select({ xref: schema.personXrefs.xref })
        .from(schema.personXrefs)
        .where(
            and(eq(schema.personXrefs.treeId, treeId), inArray(schema.personXrefs.xref, fileXrefs)),
        );
    if (existingPersons.length > 0 || existingAliases.length > 0) {
        return { ok: false, error: "gedcom.alreadyImported" };
    }

    // Who of the file is already in the tree (sameForImport: the same surname, given name and year
    // of birth, no other patronymic): those are joined to the record that is there instead of being
    // created a second time. The preview computes the same map from the same function.
    const { joins } = await joinsFor(treeId, plan);

    const existingFamilies = await db
        .select({ xref: schema.families.gedcomXref })
        .from(schema.families)
        .where(
            and(
                eq(schema.families.treeId, treeId),
                inArray(
                    schema.families.gedcomXref,
                    plan.unions.map((u) => u.xref),
                ),
            ),
        );
    if (existingFamilies.length > 0) {
        return { ok: false, error: "gedcom.alreadyImported" };
    }

    const sexOf = new Map(plan.persons.map((p) => [p.xref, p.sex]));
    let events = 0;
    let children = 0;
    let joined = 0;

    try {
        await db.transaction(async (tx) => {
            const personIdOf = new Map<string, string>();

            for (const person of plan.persons) {
                // Somebody of the tree is this person: the file brings the unions to him and his
                // identifier joins the map, so nothing is created twice. What the file knows and
                // the record lacks is added; nothing the record already says is overwritten.
                const existingId = joins.get(person.xref);
                if (existingId) {
                    personIdOf.set(person.xref, existingId);
                    await tx
                        .insert(schema.personXrefs)
                        .values({ treeId, personId: existingId, xref: person.xref })
                        .onConflictDoNothing();
                    events += await fillJoined(tx, treeId, existingId, userId, person, words);
                    joined += 1;
                    continue;
                }

                const [created] = await tx
                    .insert(schema.persons)
                    .values({
                        treeId,
                        sex: person.sex,
                        notes: person.notes === "" ? null : person.notes,
                        gedcomXref: person.xref,
                        createdBy: userId,
                        updatedBy: userId,
                    })
                    .returning({ id: schema.persons.id });
                if (!created) throw new Error("insert into persons returned no row");
                personIdOf.set(person.xref, created.id);

                await tx.insert(schema.personNames).values({
                    personId: created.id,
                    type: "birth",
                    isPrimary: true,
                    surname: person.surname || null,
                    given: person.given || null,
                    patronymic: person.patronymic || null,
                    suffix: person.suffix || null,
                });

                events += await lifeEvent(tx, treeId, created.id, "birth", person.birth, words);
                events += await lifeEvent(tx, treeId, created.id, "death", person.death, words);
            }

            for (const union of plan.unions) {
                const partners = union.partners.filter((ref) => personIdOf.has(ref));
                const kids = union.children.filter((ref) => personIdOf.has(ref));
                if (partners.length === 0 && kids.length === 0) continue;

                const marriage = union.marriage ? parseFuzzyDate(union.marriage, words) : null;
                const marriageValue = marriage?.ok ? marriage.value : null;

                const [family] = await tx
                    .insert(schema.families)
                    .values({
                        treeId,
                        type: marriageValue || partners.length === 2 ? "marriage" : "unknown",
                        gedcomXref: union.xref,
                        createdBy: userId,
                        updatedBy: userId,
                    })
                    .returning({ id: schema.families.id });
                if (!family) throw new Error("insert into families returned no row");

                for (const [index, ref] of partners.entries()) {
                    await tx.insert(schema.familyPartners).values({
                        treeId,
                        familyId: family.id,
                        personId: personIdOf.get(ref) ?? "",
                        role: partnerRole(sexOf.get(ref) ?? "unknown"),
                        sortOrder: index,
                    });
                }

                for (const ref of kids) {
                    await tx.insert(schema.familyChildren).values({
                        treeId,
                        familyId: family.id,
                        personId: personIdOf.get(ref) ?? "",
                        relation: "biological",
                    });
                    children += 1;
                }

                if (marriageValue) {
                    await tx.insert(schema.events).values({
                        ...dateFields(marriageValue),
                        treeId,
                        familyId: family.id,
                        typeCode: "marriage",
                        isPrimary: true,
                        createdBy: userId,
                        updatedBy: userId,
                    });
                    events += 1;
                }
            }
        });
    } catch (error) {
        return { ok: false, error: translate(error) };
    }

    await writeAudit({
        treeId,
        userId,
        action: "import",
        entityType: "gedcom",
        entityId: null,
    });

    return {
        ok: true,
        persons: plan.persons.length - joined,
        unions: plan.unions.length,
        children,
        events,
        joined,
    };
}

/**
 * Which people of the file the import joins to people of the tree (file xref -> person id), and
 * the names of those tree people for the preview. The tree is read as it is now, so the preview
 * and the import a moment later agree unless somebody edits the tree in between.
 */
export async function joinsFor(
    treeId: string,
    plan: ImportPlan,
): Promise<{ joins: Map<string, string>; names: Map<string, string> }> {
    const cards = await listPersonCards(treeId);
    return {
        joins: importJoins(plan.persons.map(planDuplicate), cards.map(cardToDuplicate)),
        names: new Map(cards.map((card) => [card.personId, card.fullName ?? ""])),
    };
}

/**
 * Adds to a joined person what the file knows and the record lacks: the birth or the death when
 * the record has none (the record's own events are never replaced, the join already required the
 * same year of birth), and the notes of the file appended to the record's notes unless they are
 * already in them. Returns the number of events written.
 */
async function fillJoined(
    tx: Tx,
    treeId: string,
    personId: string,
    userId: string,
    person: PlannedPerson,
    words: DateWords,
): Promise<number> {
    const present = await tx
        .select({ typeCode: schema.events.typeCode })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.treeId, treeId),
                eq(schema.events.personId, personId),
                eq(schema.events.isPrimary, true),
                inArray(schema.events.typeCode, ["birth", "death"]),
            ),
        );
    const has = new Set(present.map((row) => row.typeCode));

    let added = 0;
    if (!has.has("birth")) {
        added += await lifeEvent(tx, treeId, personId, "birth", person.birth, words);
    }
    if (!has.has("death")) {
        added += await lifeEvent(tx, treeId, personId, "death", person.death, words);
    }

    const notes = person.notes.trim();
    if (notes !== "") {
        const [row] = await tx
            .select({ notes: schema.persons.notes })
            .from(schema.persons)
            .where(and(eq(schema.persons.treeId, treeId), eq(schema.persons.id, personId)));
        const current = row?.notes?.trim() ?? "";
        if (!current.includes(notes)) {
            await tx
                .update(schema.persons)
                .set({
                    notes: current === "" ? notes : `${current}\n\n${notes}`,
                    updatedBy: userId,
                    updatedAt: new Date(),
                })
                .where(and(eq(schema.persons.treeId, treeId), eq(schema.persons.id, personId)));
        }
    }
    return added;
}

/** A person of the file in the shape the duplicate search reads. */
export function planDuplicate(person: PlannedPerson): DuplicatePerson {
    const fullName = [person.surname, person.given, person.patronymic]
        .filter((part) => part !== "")
        .join(" ");
    return {
        personId: person.xref,
        fullName,
        surname: person.surname,
        given: person.given,
        patronymic: person.patronymic,
        birthYear: yearOf(person.birth),
        deathYear: yearOf(person.death),
    };
}

async function lifeEvent(
    tx: Tx,
    treeId: string,
    personId: string,
    typeCode: "birth" | "death",
    input: string,
    words: DateWords,
): Promise<number> {
    if (input.trim() === "") return 0;
    const parsed = parseFuzzyDate(input, words);
    if (!parsed.ok || !parsed.value) return 0;
    await tx.insert(schema.events).values({
        ...dateFields(parsed.value),
        treeId,
        personId,
        typeCode,
        isPrimary: true,
    });
    return 1;
}

function dateFields(value: ParsedDate) {
    return {
        dateQualifier: value.qualifier,
        datePrecision: value.precision,
        dateStart: value.dateStart,
        dateEnd: value.dateEnd,
        dateOriginal: value.original,
    };
}

function partnerRole(sex: string): "husband" | "wife" | "partner" | "unknown" {
    if (sex === "male") return "husband";
    if (sex === "female") return "wife";
    return "unknown";
}

function translate(error: unknown): string {
    const key = pedigreeErrorKey(error);
    return key === "errors.cycle" || key === "errors.duplicatePartner" ? key : "errors.generic";
}
