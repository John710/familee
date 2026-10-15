"use server";

/**
 * Familee - server actions for unions and children
 *
 * Writing needs the editor role or higher. The rules that keep the family tree
 * consistent (no one becomes their own ancestor, nobody is a partner and a child
 * of the same union) live in the database triggers; here their messages are mapped
 * to translation keys, so the person sees a sentence, not a database error.
 */

import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type UnionResult<T extends object = object> =
    | ({ ok: true } & T)
    | { ok: false; error: string };

const UNION_TYPES = ["marriage", "partnership", "civil_union", "single_parent", "unknown"] as const;
const RELATIONS = [
    "biological",
    "adopted",
    "step",
    "foster",
    "guardianship",
    "sealing",
    "unknown",
] as const;

/** A union with a partner, or a single-parent union when the partner is not given. */
export async function createUnionAction(input: {
    slug: string;
    personId: string;
    partnerId: string | null;
    type: string;
}): Promise<UnionResult<{ familyId: string }>> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }

    if (!(UNION_TYPES as readonly string[]).includes(input.type)) {
        return { ok: false, error: "validation.required" };
    }
    if (input.partnerId === input.personId) {
        return { ok: false, error: "errors.selfRelation" };
    }

    const people = await db
        .select({ id: schema.persons.id, sex: schema.persons.sex })
        .from(schema.persons)
        .where(and(eq(schema.persons.treeId, access.treeId), isNull(schema.persons.deletedAt)));
    const sexOf = new Map(people.map((row) => [row.id, row.sex]));
    if (!sexOf.has(input.personId) || (input.partnerId && !sexOf.has(input.partnerId))) {
        return { ok: false, error: "person.notFound" };
    }

    try {
        const familyId = await db.transaction(async (tx) => {
            const [family] = await tx
                .insert(schema.families)
                .values({
                    treeId: access.treeId,
                    type: input.type as (typeof UNION_TYPES)[number],
                    createdBy: user.id,
                    updatedBy: user.id,
                })
                .returning({ id: schema.families.id });
            if (!family) throw new Error("insert into families returned no row");

            const partners = [input.personId, input.partnerId].filter(
                (id): id is string => id !== null,
            );
            for (const personId of partners) {
                await tx.insert(schema.familyPartners).values({
                    treeId: access.treeId,
                    familyId: family.id,
                    personId,
                    role: partnerRoleFor(sexOf.get(personId) ?? "unknown"),
                });
            }
            return family.id;
        });

        await writeAudit({
            treeId: access.treeId,
            userId: user.id,
            action: "create",
            entityType: "family",
            entityId: familyId,
        });

        return { ok: true, familyId };
    } catch (error) {
        return { ok: false, error: translateDatabaseError(error) };
    }
}

/** Adds a child to a union. The relation is biological unless the user says otherwise. */
export async function addChildAction(input: {
    slug: string;
    familyId: string;
    childId: string;
    relation: string;
}): Promise<UnionResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }

    if (!(RELATIONS as readonly string[]).includes(input.relation)) {
        return { ok: false, error: "validation.required" };
    }

    const [family] = await db
        .select({ id: schema.families.id })
        .from(schema.families)
        .where(
            and(eq(schema.families.id, input.familyId), eq(schema.families.treeId, access.treeId)),
        )
        .limit(1);
    if (!family) return { ok: false, error: "person.notFound" };

    try {
        await db.insert(schema.familyChildren).values({
            treeId: access.treeId,
            familyId: family.id,
            personId: input.childId,
            relation: input.relation as (typeof RELATIONS)[number],
        });
    } catch (error) {
        return { ok: false, error: translateDatabaseError(error) };
    }

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "update",
        entityType: "family",
        entityId: family.id,
    });

    return { ok: true };
}

function partnerRoleFor(sex: string): "husband" | "wife" | "partner" | "unknown" {
    if (sex === "male") return "husband";
    if (sex === "female") return "wife";
    return "unknown";
}

/** Turns the message of a database check into a translation key. */
function translateDatabaseError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("own ancestor") || message.includes("pedigree cycle")) {
        return "errors.cycle";
    }
    if (message.includes("already a partner")) {
        return "errors.duplicatePartner";
    }
    if (message.includes("belongs to another tree")) {
        return "errors.crossTree";
    }
    return "errors.generic";
}
