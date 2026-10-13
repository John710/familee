/**
 * Familee - the focus mode of the visual tree: which cards stay bright
 *
 * Pure functions, no React. The edges of the tree say who is joined to whom: a "partner" edge
 * joins a person to a union (the marriage or partnership), a "child" edge joins a union to a
 * child. Starting from one person, the focus keeps the ancestors and the descendants within
 * a number of generations, plus the partners of everybody kept, so that a family stays whole.
 * The other cards are not removed: the canvas dims them.
 */

export type FocusEdge = { id: string; source: string; target: string };

/** The node ids the focus keeps (persons as "person-…", unions as "union-…"). */
export function focusedNodeIds(edges: FocusEdge[], focusNode: string, depth: number): Set<string> {
    const childrenOf = new Map<string, string[]>();
    const parentUnionsOf = new Map<string, string[]>();
    const partnersOf = new Map<string, string[]>();
    const unionsOfPartner = new Map<string, string[]>();

    const add = (map: Map<string, string[]>, key: string, value: string) => {
        map.set(key, [...(map.get(key) ?? []), value]);
    };

    for (const edge of edges) {
        if (edge.id.startsWith("child-")) {
            // The source is the union, the target the child.
            add(childrenOf, edge.source, edge.target);
            add(parentUnionsOf, edge.target, edge.source);
        } else if (edge.id.startsWith("partner-")) {
            const union = edge.source.startsWith("union-") ? edge.source : edge.target;
            const person = union === edge.source ? edge.target : edge.source;
            add(partnersOf, union, person);
            add(unionsOfPartner, person, union);
        }
    }

    const keep = new Set<string>([focusNode]);

    // The ancestors: the unions the person was born into, and their partners, generation by generation.
    let level = [focusNode];
    for (let step = 0; step < depth; step++) {
        const next: string[] = [];
        for (const person of level) {
            for (const union of parentUnionsOf.get(person) ?? []) {
                keep.add(union);
                for (const parent of partnersOf.get(union) ?? []) {
                    if (!keep.has(parent)) {
                        keep.add(parent);
                        next.push(parent);
                    }
                }
            }
        }
        level = next;
    }

    // The descendants: the unions the person took part in, and their children, generation by generation.
    level = [focusNode];
    for (let step = 0; step < depth; step++) {
        const next: string[] = [];
        for (const person of level) {
            for (const union of unionsOfPartner.get(person) ?? []) {
                keep.add(union);
                for (const child of childrenOf.get(union) ?? []) {
                    if (!keep.has(child)) {
                        keep.add(child);
                        next.push(child);
                    }
                }
            }
        }
        level = next;
    }

    // The partners of everybody kept, with their unions, so that every family is complete.
    for (const person of [...keep]) {
        if (!person.startsWith("person-")) continue;
        for (const union of unionsOfPartner.get(person) ?? []) {
            keep.add(union);
            for (const partner of partnersOf.get(union) ?? []) keep.add(partner);
        }
    }

    return keep;
}
