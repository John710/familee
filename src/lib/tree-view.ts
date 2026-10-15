/**
 * Familee - the data of the visual tree: the cards and the lines between them
 *
 * Reads the persons and the unions of one tree, places them with ./tree-layout.ts and
 * returns plain objects for the canvas. Called from the tree page after the access check;
 * the canvas itself (components/trees/tree-canvas.tsx) only draws what it receives.
 */

import { and, asc, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { type AgeInfo, ageOf, todayIn, upcomingBirthdays } from "@/lib/age";
import { BIRTHDAY_DAYS } from "@/lib/birthdays";
import { type KinshipFamily, type Relation, relationsTo } from "@/lib/kinship";
import { listPersonCards } from "@/lib/people";
import { CARD_HEIGHT, CARD_WIDTH, layoutTree } from "@/lib/tree-layout";

export type PersonNodeData = {
    personId: string;
    name: string;
    birthYear: number | null;
    deathYear: number | null;
    isLiving: boolean | null;
    sex: string;
    href: string;
    /** The main photograph's small variant, or null when the person has none. */
    photoUrl: string | null;
    /** The part of the photograph the card shows, as fractions of it; null shows the whole. */
    photoCrop: { x: number; y: number; w: number; h: number } | null;
    /** Height over width of the photograph, to place a crop on the card. */
    photoRatio: number | null;
    /** The person the signed-in member chose as themself in this tree. */
    isSelf: boolean;
    /** How this person is related to the one who is "me"; null when there is no such person. */
    kinship: Relation | null;
    /** The age: today's for the living, the age reached for the dead; null when unknown. */
    age: AgeInfo | null;
    /** The next birthday within the notice period: its date and the days to it; null otherwise. */
    birthday: { date: string; inDays: number } | null;
    /** Notes and the timeline of the person, for the panel that opens on a click. */
    details: PersonDetails;
    /** The person's photo album. */
    albumHref: string;
};

/** One line of the timeline: a life event, or a union the person took part in. */
export type TimelineItem = {
    key: string;
    /** The event type code ("birth", "marriage", "occupation"...). */
    typeCode: string;
    value: string | null;
    description: string;
    /** The date as it was written in the source. */
    date: string | null;
    /** The date to order by (the first day of the period), or null when undated. */
    sortKey: string | null;
    /** For a union: the name of the other partner. */
    partner: string | null;
    /** The place of the event, when one is chosen. */
    place: string | null;
};

export type PersonDetails = {
    notes: string;
    timeline: TimelineItem[];
};

export type FlowNode =
    | { id: string; type: "person"; position: { x: number; y: number }; data: PersonNodeData }
    | { id: string; type: "union"; position: { x: number; y: number }; data: { familyId: string } };

export type FlowEdge = {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
    type: "smoothstep" | "straight";
};

export type TreeView = {
    nodes: FlowNode[];
    edges: FlowEdge[];
    /** Whether the tree has any card at all. */
    empty: boolean;
};

/** One union of a tree: the partners, the children, and the row's own id. */
export type TreeFamily = KinshipFamily & { id: string };

/**
 * The unions of one tree, in the shape the kinship functions take. Shared by the tree page (which
 * also lays the cards out) and by the person page's "related to" panel.
 */
export async function loadFamilies(treeId: string): Promise<TreeFamily[]> {
    const familyRows = await db
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
        })
        .from(schema.familyChildren)
        .where(eq(schema.familyChildren.treeId, treeId))
        .orderBy(asc(schema.familyChildren.birthOrder));

    return familyRows.map((family) => ({
        id: family.id,
        partners: partnerRows
            .filter((row) => row.familyId === family.id)
            .map((row) => row.personId),
        children: childRows.filter((row) => row.familyId === family.id).map((row) => row.personId),
    }));
}

/** The size of a junction dot; the node is placed by its top-left corner. */
const JUNCTION_SIZE = 12;

export async function loadTreeView(
    treeId: string,
    slug: string,
    selfPersonId: string | null,
): Promise<TreeView> {
    const cards = await listPersonCards(treeId);
    if (cards.length === 0) return { nodes: [], edges: [], empty: true };
    const today = todayIn();
    const soonBirthdays = new Map(
        upcomingBirthdays(
            cards.map((card) => ({
                personId: card.personId,
                name: card.fullName ?? "",
                birthDate: card.birthDate,
                birthPrecision: card.birthPrecision,
                isLiving: card.isLiving,
            })),
            today,
            BIRTHDAY_DAYS,
        ).map((entry) => [entry.personId, { date: entry.date, inDays: entry.inDays }]),
    );

    const families = await loadFamilies(treeId);

    const layout = layoutTree(
        cards.map((card) => card.personId),
        families,
    );

    // The details of the panel: notes, the person's events, and the events of the unions they are in.
    const noteRows = await db
        .select({ id: schema.persons.id, notes: schema.persons.notes })
        .from(schema.persons)
        .where(eq(schema.persons.treeId, treeId));
    const notesOf = new Map(noteRows.map((row) => [row.id, row.notes ?? ""]));

    const personEventRows = await db
        .select({
            id: schema.events.id,
            personId: schema.events.personId,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            description: schema.events.description,
            dateOriginal: schema.events.dateOriginal,
            sortDate: schema.events.sortDate,
            placeName: schema.places.name,
        })
        .from(schema.events)
        .leftJoin(schema.places, eq(schema.places.id, schema.events.placeId))
        .where(and(eq(schema.events.treeId, treeId), isNotNull(schema.events.personId)));

    const familyEventRows = await db
        .select({
            id: schema.events.id,
            familyId: schema.events.familyId,
            typeCode: schema.events.typeCode,
            value: schema.events.value,
            description: schema.events.description,
            dateOriginal: schema.events.dateOriginal,
            sortDate: schema.events.sortDate,
            placeName: schema.places.name,
        })
        .from(schema.events)
        .leftJoin(schema.places, eq(schema.places.id, schema.events.placeId))
        .where(and(eq(schema.events.treeId, treeId), isNotNull(schema.events.familyId)));

    const nameOf = new Map(cards.map((card) => [card.personId, card.fullName ?? ""]));
    const detailsOf = new Map<string, PersonDetails>();
    const detailsFor = (personId: string): PersonDetails => {
        const existing = detailsOf.get(personId);
        if (existing) return existing;
        const created: PersonDetails = { notes: notesOf.get(personId) ?? "", timeline: [] };
        detailsOf.set(personId, created);
        return created;
    };

    for (const event of personEventRows) {
        if (!event.personId) continue;
        detailsFor(event.personId).timeline.push({
            key: event.id,
            typeCode: event.typeCode,
            value: event.value,
            description: event.description ?? "",
            date: event.dateOriginal,
            sortKey: event.sortDate,
            partner: null,
            place: event.placeName ?? null,
        });
    }
    // A union's events (the marriage) belong to each of its partners, with the other partner named.
    for (const family of families) {
        const events = familyEventRows.filter((row) => row.familyId === family.id);
        for (const partner of family.partners) {
            const other = family.partners.find((candidate) => candidate !== partner);
            for (const event of events) {
                detailsFor(partner).timeline.push({
                    key: `${event.id}-${partner}`,
                    typeCode: event.typeCode,
                    value: event.value,
                    description: event.description ?? "",
                    date: event.dateOriginal,
                    sortKey: event.sortDate,
                    partner: other ? (nameOf.get(other) ?? null) : null,
                    place: event.placeName ?? null,
                });
            }
        }
    }
    for (const details of detailsOf.values()) {
        details.timeline.sort((a, b) => {
            if (a.sortKey === b.sortKey) return 0;
            if (a.sortKey === null) return 1;
            if (b.sortKey === null) return -1;
            return a.sortKey < b.sortKey ? -1 : 1;
        });
    }

    // The relation of every card to the signed-in person, when that person is chosen.
    const relations = selfPersonId
        ? relationsTo(
              selfPersonId,
              families,
              cards.map((card) => card.personId),
          )
        : new Map<string, Relation>();

    const nodes: FlowNode[] = [];
    for (const card of cards) {
        const place = layout.persons.get(card.personId);
        if (!place) continue;
        nodes.push({
            id: `person-${card.personId}`,
            type: "person",
            position: { x: place.x, y: place.y },
            data: {
                personId: card.personId,
                name: card.fullName ?? "",
                birthYear: card.birthYear,
                deathYear: card.deathYear,
                isLiving: card.isLiving,
                sex: card.sex,
                href: `/trees/${slug}/persons/${card.personId}`,
                photoUrl: card.portraitMediaId
                    ? `/api/trees/${slug}/media/${card.portraitMediaId}/thumb`
                    : null,
                photoCrop:
                    card.cropX === null ||
                    card.cropY === null ||
                    card.cropW === null ||
                    card.cropH === null
                        ? null
                        : { x: card.cropX, y: card.cropY, w: card.cropW, h: card.cropH },
                isSelf: card.personId === selfPersonId,
                kinship: relations.get(card.personId) ?? null,
                birthday: soonBirthdays.get(card.personId) ?? null,
                age: ageOf(
                    {
                        date: card.birthDate,
                        precision: card.birthPrecision,
                        year: card.birthYear,
                    },
                    card.deathDate
                        ? {
                              date: card.deathDate,
                              precision: card.deathPrecision,
                              year: card.deathYear,
                          }
                        : null,
                    today,
                ),
                details: detailsOf.get(card.personId) ?? {
                    notes: notesOf.get(card.personId) ?? "",
                    timeline: [],
                },
                albumHref: `/trees/${slug}/gallery/${card.personId}`,
                photoRatio:
                    card.portraitWidth && card.portraitHeight
                        ? card.portraitHeight / card.portraitWidth
                        : null,
            },
        });
    }

    const edges: FlowEdge[] = [];
    for (const family of families) {
        const junction = layout.unions.get(family.id);
        if (!junction) continue;
        nodes.push({
            id: `union-${family.id}`,
            type: "union",
            position: { x: junction.x - JUNCTION_SIZE / 2, y: junction.y - JUNCTION_SIZE / 2 },
            data: { familyId: family.id },
        });
        const junctionId = `union-${family.id}`;

        for (const partner of family.partners) {
            const place = layout.persons.get(partner);
            if (!place) continue;
            const centre = place.x + CARD_WIDTH / 2;
            const partnerId = `person-${partner}`;
            if (Math.abs(centre - junction.x) < 1) {
                // A single partner sits right above the junction.
                edges.push({
                    id: `partner-${family.id}-${partner}`,
                    source: partnerId,
                    sourceHandle: "bottom",
                    target: junctionId,
                    targetHandle: "top",
                    type: "smoothstep",
                });
            } else if (centre < junction.x) {
                edges.push({
                    id: `partner-${family.id}-${partner}`,
                    source: partnerId,
                    sourceHandle: "right",
                    target: junctionId,
                    targetHandle: "left",
                    type: partnerLineType(place.y + CARD_HEIGHT / 2, junction.y),
                });
            } else {
                edges.push({
                    id: `partner-${family.id}-${partner}`,
                    source: junctionId,
                    sourceHandle: "right",
                    target: partnerId,
                    targetHandle: "left",
                    type: partnerLineType(place.y + CARD_HEIGHT / 2, junction.y),
                });
            }
        }

        for (const child of family.children) {
            if (!layout.persons.has(child)) continue;
            edges.push({
                id: `child-${family.id}-${child}`,
                source: junctionId,
                sourceHandle: "bottom",
                target: `person-${child}`,
                targetHandle: "top",
                type: "smoothstep",
            });
        }
    }

    return { nodes, edges, empty: false };
}

/** Partners on the same level are joined by a straight bar; others by a bent line. */
function partnerLineType(cardMiddle: number, junctionY: number): "straight" | "smoothstep" {
    return Math.abs(cardMiddle - junctionY) < 1 ? "straight" : "smoothstep";
}
