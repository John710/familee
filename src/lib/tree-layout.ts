/**
 * Familee - placing the cards of the visual tree
 *
 * Pure functions, no database and no React: the caller passes the persons and the unions of
 * a tree and gets the top-left corner of every card and the centre of every union's junction.
 *
 * Generations run top to bottom. Partners of one union share a row, and a child is always one
 * row below its parents. Each person gets exactly one card: it is placed under the first union
 * that brings the person in; the other unions draw their lines to that card wherever it is.
 *
 * elkjs was considered and left out: a layered layout puts the two partners of a union on
 * different rows as soon as their parents differ, and keeping them level needs compound-node
 * tricks. The placement below is a small recursion that keeps the rows exact.
 */

/** Wide enough for a full name on two lines next to a square photograph. */
export const CARD_WIDTH = 264;
export const CARD_HEIGHT = 92;
/** Between the partners of one union and between siblings. */
const GAP = 32;
/** Between two separate groups side by side on the same canvas. */
const GROUP_GAP = 96;
/** Vertical space between two rows of cards. */
export const ROW_GAP = 96;
/** How far a single-parent union's junction hangs below its card. */
const JUNCTION_LIFT = 14;

export type LayoutFamily = {
    id: string;
    /** Partners in the order of the union; the first one is the "left" partner. */
    partners: string[];
    /** Children in birth order. */
    children: string[];
};

export type Point = { x: number; y: number };

export type TreeLayout = {
    /** Top-left corner of each card, with the generation (row) it sits in. */
    persons: Map<string, Point & { generation: number }>;
    /** Centre of each union's junction. */
    unions: Map<string, Point>;
    width: number;
    height: number;
};

/** A block of the layout: one person, or a union with the people placed under it. */
type Unit =
    | { kind: "person"; personId: string; width: number }
    | {
          kind: "union";
          familyId: string;
          /** Partners placed in this block, left to right; null where the partner is placed elsewhere. */
          slots: (string | null)[];
          children: Unit[];
          width: number;
      };

/** The row of each person: partners share a row, children sit below both parents. */
function computeGenerations(personIds: string[], families: LayoutFamily[]): Map<string, number> {
    const generation = new Map(personIds.map((id) => [id, 0]));
    // Each pass can only raise rows; the database forbids cycles, so this settles quickly.
    for (let pass = 0; pass <= personIds.length; pass++) {
        let changed = false;
        for (const family of families) {
            if (family.partners.length > 0) {
                const top = Math.max(...family.partners.map((id) => generation.get(id) ?? 0));
                for (const partner of family.partners) {
                    if ((generation.get(partner) ?? 0) < top) {
                        generation.set(partner, top);
                        changed = true;
                    }
                }
                for (const child of family.children) {
                    if ((generation.get(child) ?? 0) < top + 1) {
                        generation.set(child, top + 1);
                        changed = true;
                    }
                }
            }
        }
        if (!changed) break;
    }
    return generation;
}

export function layoutTree(personIds: string[], rawFamilies: LayoutFamily[]): TreeLayout {
    const known = new Set(personIds);
    const families = rawFamilies.map((family) => ({
        id: family.id,
        partners: family.partners.filter((id) => known.has(id)),
        children: family.children.filter((id) => known.has(id)),
    }));
    const familyById = new Map(families.map((family) => [family.id, family]));
    const generation = computeGenerations(personIds, families);

    const unionsOf = new Map<string, string[]>();
    const parentUnionsOf = new Map<string, string[]>();
    for (const family of families) {
        for (const partner of family.partners) {
            unionsOf.set(partner, [...(unionsOf.get(partner) ?? []), family.id]);
        }
        for (const child of family.children) {
            parentUnionsOf.set(child, [...(parentUnionsOf.get(child) ?? []), family.id]);
        }
    }

    const claimed = new Set<string>();
    const usedFamilies = new Set<string>();

    // Builds the block of a union. `anchor` is the person it was reached through; that
    // person is already claimed and always takes the left slot.
    function buildUnion(familyId: string, anchor: string | null): Unit {
        usedFamilies.add(familyId);
        const family = familyById.get(familyId);
        if (!family) throw new Error(`unknown union ${familyId}`);

        const slots: (string | null)[] = anchor ? [anchor] : [];
        for (const partner of family.partners) {
            if (partner === anchor) continue;
            if (claimed.has(partner)) {
                slots.push(null);
            } else {
                claimed.add(partner);
                slots.push(partner);
            }
        }
        // Two slots at most; a third partner is placed by its own union later.
        slots.splice(2);
        // A partner placed elsewhere leaves no gap: the one who is here is centred.
        const present = slots.filter((id) => id !== null);
        slots.splice(0, slots.length, ...present);

        const children: Unit[] = [];
        for (const child of family.children) {
            if (claimed.has(child)) continue;
            children.push(unitOfPerson(child));
        }

        const pairWidth = slots.length === 2 ? CARD_WIDTH * 2 + GAP : CARD_WIDTH;
        const childrenWidth =
            children.reduce((sum, unit) => sum + unit.width, 0) +
            GAP * Math.max(0, children.length - 1);
        return {
            kind: "union",
            familyId,
            slots,
            children,
            width: Math.max(pairWidth, childrenWidth),
        };
    }

    // Claims a person and builds the first union of theirs that is not built yet.
    function unitOfPerson(personId: string): Unit {
        claimed.add(personId);
        const own = (unionsOf.get(personId) ?? []).find((id) => !usedFamilies.has(id));
        if (own) return buildUnion(own, personId);
        return { kind: "person", personId, width: CARD_WIDTH };
    }

    const units: Unit[] = [];
    // First the unions of people with no parents in the tree, so the family trees start at
    // the top; then whatever is left (a union of people already placed, for example).
    const isTop = (family: { partners: string[] }) =>
        family.partners.every((id) => (parentUnionsOf.get(id) ?? []).length === 0);
    for (const family of families.filter(isTop)) {
        if (!usedFamilies.has(family.id)) units.push(buildUnion(family.id, null));
    }
    for (const family of families) {
        if (!usedFamilies.has(family.id)) units.push(buildUnion(family.id, null));
    }
    for (const personId of personIds) {
        if (!claimed.has(personId)) units.push(unitOfPerson(personId));
    }

    const persons = new Map<string, Point & { generation: number }>();
    const unions = new Map<string, Point>();
    const rowTop = (row: number) => row * (CARD_HEIGHT + ROW_GAP);

    function place(unit: Unit, x: number): void {
        if (unit.kind === "person") {
            const row = generation.get(unit.personId) ?? 0;
            persons.set(unit.personId, { x, y: rowTop(row), generation: row });
            return;
        }

        const centre = x + unit.width / 2;
        const slotCount = unit.slots.length;

        // Partners of this block: side by side for a pair, centred for a single partner.
        unit.slots.forEach((personId, index) => {
            if (personId === null) return;
            const left =
                slotCount === 2
                    ? centre - GAP / 2 - CARD_WIDTH + index * (CARD_WIDTH + GAP)
                    : centre - CARD_WIDTH / 2;
            const row = generation.get(personId) ?? 0;
            persons.set(personId, { x: left, y: rowTop(row), generation: row });
        });

        // The junction: between the cards of a pair, below a single partner, above the
        // children when the union has no partner at all.
        const firstPartner = unit.slots.find((id) => id !== null);
        const partnerRow = firstPartner ? (generation.get(firstPartner) ?? 0) : null;
        if (partnerRow !== null && slotCount === 2) {
            unions.set(unit.familyId, { x: centre, y: rowTop(partnerRow) + CARD_HEIGHT / 2 });
        } else if (partnerRow !== null) {
            unions.set(unit.familyId, {
                x: centre,
                y: rowTop(partnerRow) + CARD_HEIGHT + JUNCTION_LIFT,
            });
        } else if (unit.children.length > 0) {
            const childRow = firstChildRow(unit);
            unions.set(unit.familyId, { x: centre, y: rowTop(childRow) - ROW_GAP / 2 });
        }

        let cursor = x + (unit.width - childrenWidth(unit)) / 2;
        for (const child of unit.children) {
            place(child, cursor);
            cursor += child.width + GAP;
        }
    }

    function childrenWidth(unit: Extract<Unit, { kind: "union" }>): number {
        return (
            unit.children.reduce((sum, child) => sum + child.width, 0) +
            GAP * Math.max(0, unit.children.length - 1)
        );
    }

    function firstChildRow(unit: Extract<Unit, { kind: "union" }>): number {
        const first = unit.children[0];
        if (!first) return 0;
        if (first.kind === "person") return generation.get(first.personId) ?? 0;
        const slot = first.slots.find((id) => id !== null);
        return slot ? (generation.get(slot) ?? 0) : firstChildRow(first);
    }

    let cursor = 0;
    for (const unit of units) {
        place(unit, cursor);
        cursor += unit.width + GROUP_GAP;
    }

    let width = 0;
    let height = 0;
    for (const point of persons.values()) {
        width = Math.max(width, point.x + CARD_WIDTH);
        height = Math.max(height, point.y + CARD_HEIGHT);
    }
    for (const point of unions.values()) {
        width = Math.max(width, point.x);
        height = Math.max(height, point.y);
    }

    return { persons, unions, width, height };
}
