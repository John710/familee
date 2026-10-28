/**
 * Familee - how a person is related to the signed-in person ("who am I to them")
 *
 * Pure functions, no database: the relation is worked out from the unions of the tree. Two
 * people are related by blood through their nearest common ancestor: the number of generations
 * from the first one up to that ancestor (up) and from the second one (down) names the relation
 * (0 and 2 is a grandchild, 2 and 2 is a second cousin, 2 and 3 is a second cousin once removed).
 * Siblings with one parent in common are half-siblings. A partner in a union is a spouse, or a
 * former spouse when the union ended in a divorce. A step or adoptive link between a parent and a
 * child is named as such and is not counted as blood; a step link leads to no relatives at all.
 * The phrases themselves are in messages/<locale>.json under kinship.* and are composed in the
 * component that shows them.
 */

export type Relation =
    | { kind: "self" }
    | { kind: "spouse" }
    /** The partner of a union that ended in a divorce. */
    | { kind: "exSpouse" }
    /** A half-sibling has up 1 and down 1 like a sibling, and `half` set. */
    | { kind: "blood"; up: number; down: number; half?: true }
    /** The spouse of a blood relative: the relative's own relation, named "...-in-law". */
    | { kind: "inLaw"; up: number; down: number }
    /** A parent or a child that is not one by birth; the name is the one the person is called by. */
    | { kind: "link"; link: "stepParent" | "stepChild" | "adoptiveParent" | "adoptedChild" };

export type KinshipFamily = {
    partners: string[];
    children: string[];
    /** True when the union has a divorce event: its partners are former spouses. */
    ended?: boolean;
    /**
     * The links of children that are not by birth: child id, then parent id, then the relation
     * that applies to that parent (family_children.relation, or its per-partner override). A pair
     * that is missing is a plain parent-child link.
     */
    parentLinks?: Record<string, Record<string, string>>;
};

/** How far up the search goes; the database guard uses the same bound. */
const MAX_DEPTH = 20;

/** The shortest number of generations from `start` up to each of its ancestors (start counts as 0). */
function ancestorDepths(start: string, parentsOf: Map<string, string[]>): Map<string, number> {
    const depths = new Map<string, number>([[start, 0]]);
    let level = [start];
    for (let step = 1; step <= MAX_DEPTH && level.length > 0; step++) {
        const next: string[] = [];
        for (const person of level) {
            for (const parent of parentsOf.get(person) ?? []) {
                if (!depths.has(parent)) {
                    depths.set(parent, step);
                    next.push(parent);
                }
            }
        }
        level = next;
    }
    return depths;
}

/** The relation of every person to `selfId`; people with no blood or marriage link get no entry. */
export function relationsTo(
    selfId: string,
    families: KinshipFamily[],
    people: string[],
): Map<string, Relation> {
    // The parents a person is related to by blood or by adoption. A step parent is not among them.
    const parentsOf = new Map<string, Set<string>>();
    // What each parent-child link is, when any union says so: the kinds seen for the pair.
    const linkKinds = new Map<string, Set<string>>();
    const spousesOf = new Map<string, string[]>();
    // The partners of a union that has not ended.
    const currentSpousesOf = new Map<string, Set<string>>();
    for (const family of families) {
        for (const child of family.children) {
            for (const parent of family.partners) {
                if (parent === child) continue;
                const kind = family.parentLinks?.[child]?.[parent] ?? "biological";
                const key = `${child}\u0000${parent}`;
                linkKinds.set(key, (linkKinds.get(key) ?? new Set()).add(kind));
                if (kind === "step") continue;
                parentsOf.set(child, (parentsOf.get(child) ?? new Set()).add(parent));
            }
        }
        for (const partner of family.partners) {
            const others = family.partners.filter((candidate) => candidate !== partner);
            spousesOf.set(partner, [...(spousesOf.get(partner) ?? []), ...others]);
            if (!family.ended) {
                const current = currentSpousesOf.get(partner) ?? new Set<string>();
                for (const other of others) current.add(other);
                currentSpousesOf.set(partner, current);
            }
        }
    }
    const parentsList = new Map([...parentsOf].map(([child, set]) => [child, [...set]]));

    /** "step" or "adopted" when every union that links the pair says so; null for a plain link. */
    const nonBirthLink = (child: string, parent: string): "step" | "adopted" | null => {
        const kinds = linkKinds.get(`${child}\u0000${parent}`);
        if (!kinds) return null;
        if ([...kinds].some((kind) => kind !== "step" && kind !== "adopted")) return null;
        return kinds.has("adopted") ? "adopted" : "step";
    };

    const selfDepths = ancestorDepths(selfId, parentsList);
    const result = new Map<string, Relation>();
    for (const person of people) {
        if (person === selfId) {
            result.set(person, { kind: "self" });
            continue;
        }
        if ((spousesOf.get(selfId) ?? []).includes(person)) {
            const current = currentSpousesOf.get(selfId)?.has(person) ?? false;
            result.set(person, { kind: current ? "spouse" : "exSpouse" });
            continue;
        }

        // A parent or a child by step or by adoption is named so, and is not a blood relative.
        const parentLink = nonBirthLink(selfId, person);
        if (parentLink) {
            const link = parentLink === "step" ? "stepParent" : "adoptiveParent";
            result.set(person, { kind: "link", link });
            continue;
        }
        const childLink = nonBirthLink(person, selfId);
        if (childLink) {
            const link = childLink === "step" ? "stepChild" : "adoptedChild";
            result.set(person, { kind: "link", link });
            continue;
        }

        // The common ancestor that makes the shortest path: fewest generations, then the most even.
        const otherDepths = ancestorDepths(person, parentsList);
        let best: { up: number; down: number } | null = null;
        for (const [ancestor, up] of selfDepths) {
            const down = otherDepths.get(ancestor);
            if (down === undefined) continue;
            const better =
                best === null ||
                up + down < best.up + best.down ||
                (up + down === best.up + best.down &&
                    Math.max(up, down) < Math.max(best.up, best.down));
            if (better) best = { up, down };
        }
        if (best) {
            const { up, down } = best;
            const half = up === 1 && down === 1 && isHalf(selfId, person, parentsOf);
            result.set(
                person,
                half ? { kind: "blood", up, down, half: true } : { kind: "blood", up, down },
            );
        }
    }

    // The spouses of blood relatives (an aunt's husband, a son's wife): they are in-laws.
    for (const person of people) {
        if (result.has(person)) continue;
        for (const spouse of spousesOf.get(person) ?? []) {
            const relative = result.get(spouse);
            if (relative?.kind === "blood") {
                result.set(person, { kind: "inLaw", up: relative.up, down: relative.down });
                break;
            }
        }
    }
    return result;
}

/**
 * Two siblings are half-siblings when they share exactly one parent and at least one of them has
 * another parent on record. A pair that knows only one parent each, the same one, stays siblings:
 * nothing says the other parent differs.
 */
function isHalf(a: string, b: string, parentsOf: Map<string, Set<string>>): boolean {
    const first = parentsOf.get(a) ?? new Set<string>();
    const second = parentsOf.get(b) ?? new Set<string>();
    const shared = [...first].filter((parent) => second.has(parent));
    return shared.length === 1 && (first.size > 1 || second.size > 1);
}

/**
 * How `personId` is related to `otherId`, in the words of relationsTo but with the other person as
 * the origin: the phrase then reads "this person is the other's ...". Null when there is no link.
 */
export function relationBetween(
    personId: string,
    otherId: string,
    families: KinshipFamily[],
): Relation | null {
    if (personId === otherId) return { kind: "self" };
    return relationsTo(otherId, families, [personId]).get(personId) ?? null;
}
