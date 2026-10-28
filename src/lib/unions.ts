/**
 * Familee - reading unions (families) and parentage
 *
 * Not a server action: called from server components after the access check.
 * A union is a row of familee.families with its partners and children; the
 * names come from familee.person_cards.
 */

import { and, asc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { listEventCitations } from "@/lib/library";

/** One event of a union: the marriage, the divorce, the day they met. */
export type UnionEvent = {
    id: string;
    typeCode: string;
    value: string | null;
    description: string | null;
    /** The date as it was written ("12 April 1921"), not as it was parsed. */
    dateOriginal: string | null;
    placeId: string | null;
    placeName: string | null;
    citations: {
        id: string;
        sourceTitle: string;
        page: string | null;
        textExcerpt: string | null;
    }[];
};

export type UnionView = {
    familyId: string;
    type: string;
    /** True for a union without partners that the person is listed in as a child. */
    asChild: boolean;
    partner: { personId: string; name: string } | null;
    children: { personId: string; name: string; relation: string }[];
    events: UnionEvent[];
};

/** The event types a union can have (the reference data marks them for a family). */
export async function listFamilyEventTypes(): Promise<
    { code: string; hasValue: boolean; isVital: boolean }[]
> {
    return db
        .select({
            code: schema.eventTypes.code,
            hasValue: schema.eventTypes.hasValue,
            isVital: schema.eventTypes.isVital,
        })
        .from(schema.eventTypes)
        .where(eq(schema.eventTypes.appliesTo, "family"))
        .orderBy(asc(schema.eventTypes.sortOrder), asc(schema.eventTypes.code));
}

/** The unions a person belongs to, with the other partner, the children and the events of each. */
export async function listUnionsForPerson(treeId: string, personId: string): Promise<UnionView[]> {
    const partnerMemberships = await db
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

    // A union the person belongs to only as a child, and which has no partner (a GEDCOM FAM with
    // only CHIL lines): nothing finds it through a partner, yet it holds the person's siblings.
    // A union whose partners are all in the trash counts as having none, as in the tree.
    const parentless = await db
        .select({
            familyId: schema.familyChildren.familyId,
            type: schema.families.type,
        })
        .from(schema.familyChildren)
        .innerJoin(schema.families, eq(schema.families.id, schema.familyChildren.familyId))
        .where(
            and(
                eq(schema.familyChildren.treeId, treeId),
                eq(schema.familyChildren.personId, personId),
                notExists(
                    db
                        .select({ one: sql`1` })
                        .from(schema.familyPartners)
                        .innerJoin(
                            schema.persons,
                            eq(schema.persons.id, schema.familyPartners.personId),
                        )
                        .where(
                            and(
                                eq(schema.familyPartners.familyId, schema.families.id),
                                isNull(schema.persons.deletedAt),
                            ),
                        ),
                ),
            ),
        );
    const memberships = [
        ...partnerMemberships.map((row) => ({ ...row, asChild: false })),
        ...parentless.map((row) => ({ ...row, asChild: true })),
    ];

    // The events of every union of this person, read in one query: a marriage belongs to the
    // union, not to a partner, so nothing would find it by the person alone.
    const familyIds = memberships.map((membership) => membership.familyId);
    const eventRows =
        familyIds.length === 0
            ? []
            : await db
                  .select({
                      id: schema.events.id,
                      familyId: schema.events.familyId,
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
                          eq(schema.events.treeId, treeId),
                          inArray(schema.events.familyId, familyIds),
                      ),
                  )
                  .orderBy(asc(schema.events.sortDate), asc(schema.events.createdAt));
    const citations = await listEventCitations(
        treeId,
        eventRows.map((event) => event.id),
    );

    // The partners and the children of every union, in two queries rather than two per union.
    const partnerRows =
        familyIds.length === 0
            ? []
            : await db
                  .select({
                      familyId: schema.familyPartners.familyId,
                      personId: schema.personCards.personId,
                      name: schema.personCards.fullName,
                  })
                  .from(schema.familyPartners)
                  .innerJoin(
                      schema.personCards,
                      eq(schema.personCards.personId, schema.familyPartners.personId),
                  )
                  .where(
                      and(
                          eq(schema.familyPartners.treeId, treeId),
                          inArray(schema.familyPartners.familyId, familyIds),
                          ne(schema.familyPartners.personId, personId),
                      ),
                  );

    const childRows =
        familyIds.length === 0
            ? []
            : await db
                  .select({
                      familyId: schema.familyChildren.familyId,
                      personId: schema.personCards.personId,
                      name: schema.personCards.fullName,
                      relation: schema.familyChildren.relation,
                  })
                  .from(schema.familyChildren)
                  .innerJoin(
                      schema.personCards,
                      eq(schema.personCards.personId, schema.familyChildren.personId),
                  )
                  .where(
                      and(
                          eq(schema.familyChildren.treeId, treeId),
                          inArray(schema.familyChildren.familyId, familyIds),
                      ),
                  )
                  .orderBy(asc(schema.familyChildren.birthOrder));

    const views: UnionView[] = [];
    for (const membership of memberships) {
        const partner = partnerRows.find((row) => row.familyId === membership.familyId);
        const children = childRows.filter((row) => row.familyId === membership.familyId);

        views.push({
            familyId: membership.familyId,
            type: membership.type,
            asChild: membership.asChild,
            partner: partner ? { personId: partner.personId, name: partner.name ?? "" } : null,
            children: children.map((child) => ({
                personId: child.personId,
                name: child.name ?? "",
                relation: child.relation,
            })),
            events: eventRows
                .filter((event) => event.familyId === membership.familyId)
                .map((event) => ({
                    id: event.id,
                    typeCode: event.typeCode,
                    value: event.value,
                    description: event.description,
                    dateOriginal: event.dateOriginal,
                    placeId: event.placeId,
                    placeName: event.placeName,
                    citations: citations.get(event.id) ?? [],
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
