/**
 * Familee - the data of the visual tree: the cards and the lines between them
 *
 * Reads the persons and the unions of one tree, places them with ./tree-layout.ts and
 * returns plain objects for the canvas. Called from the tree page after the access check;
 * the canvas itself (components/trees/tree-canvas.tsx) only draws what it receives.
 */

import { asc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
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

/** The size of a junction dot; the node is placed by its top-left corner. */
const JUNCTION_SIZE = 12;

export async function loadTreeView(treeId: string, slug: string): Promise<TreeView> {
    const cards = await listPersonCards(treeId);
    if (cards.length === 0) return { nodes: [], edges: [], empty: true };

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

    const families = familyRows.map((family) => ({
        id: family.id,
        partners: partnerRows
            .filter((row) => row.familyId === family.id)
            .map((row) => row.personId),
        children: childRows.filter((row) => row.familyId === family.id).map((row) => row.personId),
    }));

    const layout = layoutTree(
        cards.map((card) => card.personId),
        families,
    );

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
