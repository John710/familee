/**
 * Familee - writing a GEDCOM import into a tree
 *
 * Takes the plan from src/lib/gedcom-plan.ts and writes it in one transaction: the
 * persons with their primary names and life events, the unions with their partners,
 * children and marriage dates. The identifiers of the file (@I1@, @F1@) are kept in
 * gedcom_xref. When the tree already holds a person or a union with one of those
 * identifiers, the import stops: records of two files must not be merged by accident.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { type ParsedDate, parseFuzzyDate } from "@/lib/fuzzy-date";
import type { ImportPlan } from "@/lib/gedcom-plan";

export type ImportResult =
    | { ok: true; persons: number; unions: number; children: number; events: number }
    | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function importIntoTree(input: {
    treeId: string;
    userId: string;
    plan: ImportPlan;
}): Promise<ImportResult> {
    const { treeId, userId, plan } = input;

    const existingPersons = await db
        .select({ xref: schema.persons.gedcomXref })
        .from(schema.persons)
        .where(
            and(
                eq(schema.persons.treeId, treeId),
                inArray(
                    schema.persons.gedcomXref,
                    plan.persons.map((p) => p.xref),
                ),
            ),
        );
    if (existingPersons.length > 0) {
        return { ok: false, error: "gedcom.alreadyImported" };
    }

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

    try {
        await db.transaction(async (tx) => {
            const personIdOf = new Map<string, string>();

            for (const person of plan.persons) {
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
                });

                events += await lifeEvent(tx, treeId, created.id, "birth", person.birth);
                events += await lifeEvent(tx, treeId, created.id, "death", person.death);
            }

            for (const union of plan.unions) {
                const partners = union.partners.filter((ref) => personIdOf.has(ref));
                const kids = union.children.filter((ref) => personIdOf.has(ref));
                if (partners.length === 0 && kids.length === 0) continue;

                const marriage = union.marriage ? parseFuzzyDate(union.marriage) : null;
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

    return { ok: true, persons: plan.persons.length, unions: plan.unions.length, children, events };
}

async function lifeEvent(
    tx: Tx,
    treeId: string,
    personId: string,
    typeCode: "birth" | "death",
    input: string,
): Promise<number> {
    if (input.trim() === "") return 0;
    const parsed = parseFuzzyDate(input);
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
    if (sex === "other") return "partner";
    return "unknown";
}

function translate(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("own ancestor") || message.includes("pedigree cycle"))
        return "errors.cycle";
    if (message.includes("already a partner")) return "errors.duplicatePartner";
    return "errors.generic";
}
