/**
 * Familee - the focus mode of the visual tree: which cards stay bright
 *
 * The edges say who is joined to whom: a "partner" edge joins a person to a union, a "child" edge
 * joins a union to a child. From one person the focus keeps the ancestors and the descendants
 * within the number of generations asked for, plus the partners of everybody kept - and nothing
 * else, so a sibling of the focus, who is neither above nor below them, is left dimmed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { type FocusEdge, focusedNodeIds } from "@/lib/tree-focus";

/**
 * Four generations:
 *   dad + mom (u1) - their children: me, sib
 *   me + wife (u2) - their child: kid; sib + sibspouse (u3) - their child: nephew
 *   kid + kidspouse (u4) - their child: grandkid
 */
const EDGES: FocusEdge[] = [
    { id: "partner-dad", source: "union-u1", target: "person-dad" },
    { id: "partner-mom", source: "person-mom", target: "union-u1" },
    { id: "child-me", source: "union-u1", target: "person-me" },
    { id: "child-sib", source: "union-u1", target: "person-sib" },

    { id: "partner-me", source: "union-u2", target: "person-me" },
    { id: "partner-wife", source: "union-u2", target: "person-wife" },
    { id: "child-kid", source: "union-u2", target: "person-kid" },

    { id: "partner-sib", source: "union-u3", target: "person-sib" },
    { id: "partner-sibspouse", source: "union-u3", target: "person-sibspouse" },
    { id: "child-nephew", source: "union-u3", target: "person-nephew" },

    { id: "partner-kid", source: "union-u4", target: "person-kid" },
    { id: "partner-kidspouse", source: "union-u4", target: "person-kidspouse" },
    { id: "child-grandkid", source: "union-u4", target: "person-grandkid" },
];

function keeps(depth: number, focusNode = "person-me"): string[] {
    return [...focusedNodeIds(EDGES, focusNode, depth)];
}

test("a person alone keeps their own union and their partner", () => {
    const kept = keeps(0);
    assert.deepEqual(new Set(kept), new Set(["person-me", "union-u2", "person-wife"]));
});

test("one generation up and down", () => {
    const kept = new Set(keeps(1));

    // The parents and the union that joins them, the child, and the partner of the child.
    for (const id of [
        "person-me",
        "person-dad",
        "person-mom",
        "union-u1",
        "person-kid",
        "union-u2",
    ]) {
        assert.ok(kept.has(id), `${id} should stay bright`);
    }
    assert.ok(kept.has("union-u4") && kept.has("person-kidspouse"));

    // The sibling branch is neither above nor below the focus, so it stays dim.
    for (const id of ["person-sib", "union-u3", "person-nephew", "person-grandkid"]) {
        assert.equal(kept.has(id), false, `${id} should stay dim`);
    }
});

test("the second generation takes the grandchildren in", () => {
    const kept = new Set(keeps(2));
    assert.ok(kept.has("person-grandkid"));
    // Still not the sibling's branch: it is not on the line of the focus.
    assert.equal(kept.has("person-nephew"), false);
});

test("a partner edge counts whichever way round it was written", () => {
    // The edge of the mother has the person as its source, the father's has the union.
    const kept = new Set(keeps(1));
    assert.ok(kept.has("person-mom"));
    assert.ok(kept.has("person-dad"));
});

test("a person with no edges keeps nothing but themselves", () => {
    assert.deepEqual([...focusedNodeIds([], "person-alone", 5)], ["person-alone"]);
});

test("a loop in the edges does not run away", () => {
    // A person who is a partner of the same union they are a child of; the database refuses it,
    // but an old tree could still carry it.
    const loop: FocusEdge[] = [
        { id: "child-a", source: "union-x", target: "person-a" },
        { id: "partner-a", source: "union-x", target: "person-a" },
    ];
    assert.deepEqual(
        new Set(focusedNodeIds(loop, "person-a", 10)),
        new Set(["person-a", "union-x"]),
    );
});
