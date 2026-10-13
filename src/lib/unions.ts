/**
 * Familee - reading unions (families) and parentage
 *
 * Not a server action: called from server components after the access check.
 * A union is a row of familee.families with its partners and children; the
 * names come from familee.person_cards.
 */

import { and, asc, eq, ne } from "drizzle-orm";

import { db, schema } from "@/db";

export type UnionView = {
    familyId: string;
    type: string;
    partner: { personId: string; name: string } | null;
    children: { personId: string; name: string; relation: string }[];
};

/** The unions a person belongs to, with the other partner and the children of each. */
export async function listUnionsForPerson(treeId: string, personId: string): Promise<UnionView[]> {
    const memberships = await db
        .select({
            familyId: schema.familyPartners.familyId,
            type: schema.families.type,
        })
        .from(schema.familyPartners)
        .innerJoin(schema.families, eq(schema.families.id, schema.familyPartners.familyId))
        .where(
            and(
                eq(schema.familyPartners.treeId, treeId),
                eq(schema.familyPartners.personId, personId),
            ),
        );

    const views: UnionView[] = [];
    for (const membership of memberships) {
        const partners = await db
            .select({ personId: schema.personCards.personId, name: schema.personCards.fullName })
            .from(schema.familyPartners)
            .innerJoin(
                schema.personCards,
                eq(schema.personCards.personId, schema.familyPartners.personId),
            )
            .where(
                and(
                    eq(schema.familyPartners.familyId, membership.familyId),
                    ne(schema.familyPartners.personId, personId),
                ),
            )
            .limit(1);

        const children = await db
            .select({
                personId: schema.personCards.personId,
                name: schema.personCards.fullName,
                relation: schema.familyChildren.relation,
            })
            .from(schema.familyChildren)
            .innerJoin(
                schema.personCards,
                eq(schema.personCards.personId, schema.familyChildren.personId),
            )
            .where(eq(schema.familyChildren.familyId, membership.familyId))
            .orderBy(asc(schema.familyChildren.birthOrder));

        const partner = partners[0];
        views.push({
            familyId: membership.familyId,
            type: membership.type,
            partner: partner ? { personId: partner.personId, name: partner.name ?? "" } : null,
            children: children.map((child) => ({
                personId: child.personId,
                name: child.name ?? "",
                relation: child.relation,
            })),
        });
    }
    return views;
}

/** Everybody in the tree, for the choosers of partners and children. */
export async function listPersonOptions(treeId: string) {
    return db
        .select({ personId: schema.personCards.personId, name: schema.personCards.fullName })
        .from(schema.personCards)
        .where(eq(schema.personCards.treeId, treeId))
        .orderBy(asc(schema.personCards.fullName));
}
