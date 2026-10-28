/**
 * Familee - putting the rows of the unions together
 *
 * The rows of families, family_partners and family_children arrive in three queries (the people in
 * the trash already left out); this assembles them into the shape the layout and the kinship
 * functions take. No database here, so the rule about which unions stay can be tested.
 */

/** One union of a tree: its id, the partners and the children. */
export type AssembledFamily = { id: string; partners: string[]; children: string[] };

/**
 * The unions with their partners and children, in the order the rows came.
 *
 * A union with children and no partner stays: a GEDCOM file may list a FAM with only CHIL lines,
 * the database allows it, and the children would otherwise vanish from the tree. A union with
 * nobody left in it (every person in the trash, or a union created and never filled) is dropped:
 * there is nothing to draw, and when the people come back the union is exactly as it was.
 */
export function assembleFamilies(
    familyRows: { id: string }[],
    partnerRows: { familyId: string; personId: string }[],
    childRows: { familyId: string; personId: string }[],
): AssembledFamily[] {
    const partnersOf = new Map<string, string[]>();
    for (const row of partnerRows) {
        const list = partnersOf.get(row.familyId);
        if (list) list.push(row.personId);
        else partnersOf.set(row.familyId, [row.personId]);
    }
    const childrenOf = new Map<string, string[]>();
    for (const row of childRows) {
        const list = childrenOf.get(row.familyId);
        if (list) list.push(row.personId);
        else childrenOf.set(row.familyId, [row.personId]);
    }

    return familyRows
        .map((family) => ({
            id: family.id,
            partners: partnersOf.get(family.id) ?? [],
            children: childrenOf.get(family.id) ?? [],
        }))
        .filter((family) => family.partners.length > 0 || family.children.length > 0);
}
