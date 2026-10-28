/**
 * Familee - putting the rows of the unions together
 *
 * The rows of families, family_partners and family_children arrive in a few queries (the people in
 * the trash already left out); this assembles them into the shape the layout and the kinship
 * functions take. No database here, so the rule about which unions stay can be tested.
 */

/**
 * One union of a tree: its id, the partners and the children. `ended` and `parentLinks` are the
 * extra input of ./kinship.ts: a divorced union, and the children that are not a parent's by birth.
 */
export type AssembledFamily = {
    id: string;
    partners: string[];
    children: string[];
    ended: boolean;
    parentLinks: Record<string, Record<string, string>>;
};

/** A child row with the relation columns of family_children. */
export type ChildRow = {
    familyId: string;
    personId: string;
    /** family_children.relation; missing counts as a birth link. */
    relation?: string;
    /** family_children.relation_by_partner: the relation per partner, overriding `relation`. */
    relationByPartner?: Record<string, string> | null;
};

/**
 * The unions with their partners and children, in the order the rows came.
 *
 * A union with children and no partner stays: a GEDCOM file may list a FAM with only CHIL lines,
 * the database allows it, and the children would otherwise vanish from the tree. A union with
 * nobody left in it (every person in the trash, or a union created and never filled) is dropped:
 * there is nothing to draw, and when the people come back the union is exactly as it was.
 *
 * `endedFamilyIds` are the unions that have a divorce event. A parent-child link that is a plain
 * birth link is left out of `parentLinks`; the relation of a partner in `relationByPartner` wins
 * over the child's own `relation`, and only the partners of that union are looked at.
 */
export function assembleFamilies(
    familyRows: { id: string }[],
    partnerRows: { familyId: string; personId: string }[],
    childRows: ChildRow[],
    endedFamilyIds: Iterable<string> = [],
): AssembledFamily[] {
    const partnersOf = new Map<string, string[]>();
    for (const row of partnerRows) {
        const list = partnersOf.get(row.familyId);
        if (list) list.push(row.personId);
        else partnersOf.set(row.familyId, [row.personId]);
    }
    const childrenOf = new Map<string, ChildRow[]>();
    for (const row of childRows) {
        const list = childrenOf.get(row.familyId);
        if (list) list.push(row);
        else childrenOf.set(row.familyId, [row]);
    }
    const ended = new Set(endedFamilyIds);

    return familyRows
        .map((family) => {
            const partners = partnersOf.get(family.id) ?? [];
            const children = childrenOf.get(family.id) ?? [];
            const parentLinks: Record<string, Record<string, string>> = {};
            for (const child of children) {
                for (const partner of partners) {
                    const relation = child.relationByPartner?.[partner] ?? child.relation;
                    if (!relation || relation === "biological") continue;
                    parentLinks[child.personId] = {
                        ...parentLinks[child.personId],
                        [partner]: relation,
                    };
                }
            }
            return {
                id: family.id,
                partners,
                children: children.map((child) => child.personId),
                ended: ended.has(family.id),
                parentLinks,
            };
        })
        .filter((family) => family.partners.length > 0 || family.children.length > 0);
}
