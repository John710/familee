/**
 * Familee - how a person is related to the signed-in person ("who am I to them")
 *
 * Pure functions, no database: the relation is worked out from the unions of the tree. Two
 * people are related by blood through their nearest common ancestor: the number of generations
 * from the first one up to that ancestor (up) and from the second one (down) names the relation
 * (0 and 2 is a grandchild, 2 and 2 is a second cousin, 2 and 3 is a second cousin once removed).
 * A partner in a union is a spouse. The phrases themselves are in messages/<locale>.json under
 * kinship.* and are composed in the component that shows them.
 */

export type Relation =
    | { kind: "self" }
    | { kind: "spouse" }
    | { kind: "blood"; up: number; down: number }
    /** The spouse of a blood relative: the relative's own relation, named "...-in-law". */
    | { kind: "inLaw"; up: number; down: number };

export type KinshipFamily = { partners: string[]; children: string[] };

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
    const parentsOf = new Map<string, string[]>();
    const spousesOf = new Map<string, string[]>();
    for (const family of families) {
        for (const child of family.children) {
            parentsOf.set(child, [...(parentsOf.get(child) ?? []), ...family.partners]);
        }
        for (const partner of family.partners) {
            const others = family.partners.filter((candidate) => candidate !== partner);
            spousesOf.set(partner, [...(spousesOf.get(partner) ?? []), ...others]);
        }
    }

    const selfDepths = ancestorDepths(selfId, parentsOf);
    const result = new Map<string, Relation>();
    for (const person of people) {
        if (person === selfId) {
            result.set(person, { kind: "self" });
            continue;
        }
        if ((spousesOf.get(selfId) ?? []).includes(person)) {
            result.set(person, { kind: "spouse" });
            continue;
        }

        // The common ancestor that makes the shortest path: fewest generations, then the most even.
        const otherDepths = ancestorDepths(person, parentsOf);
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
        if (best) result.set(person, { kind: "blood", up: best.up, down: best.down });
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
