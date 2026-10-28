/**
 * Familee - which unions the tree keeps
 *
 * A GEDCOM FAM with only CHIL lines is imported as a union with children and no partner. The tree
 * must still draw it, or the children lose their place; a union with nobody left is not drawn.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { assembleFamilies } from "@/lib/tree-families";
import { layoutTree } from "@/lib/tree-layout";

test("a union with children and no partner is kept", () => {
    const families = assembleFamilies(
        [{ id: "u1" }],
        [],
        [
            { familyId: "u1", personId: "kid" },
            { familyId: "u1", personId: "sib" },
        ],
    );
    assert.deepEqual(families, [{ id: "u1", partners: [], children: ["kid", "sib"] }]);

    const layout = layoutTree(["kid", "sib"], families);
    assert.equal(layout.persons.get("kid")?.y, 0);
    assert.ok(layout.unions.get("u1"));
});

test("a union with nobody in it is dropped", () => {
    assert.deepEqual(assembleFamilies([{ id: "empty" }], [], []), []);
});

test("partners and children are grouped by union and keep their order", () => {
    const families = assembleFamilies(
        [{ id: "u1" }, { id: "u2" }],
        [
            { familyId: "u1", personId: "a" },
            { familyId: "u2", personId: "c" },
            { familyId: "u1", personId: "b" },
        ],
        [
            { familyId: "u1", personId: "x" },
            { familyId: "u1", personId: "y" },
        ],
    );
    assert.deepEqual(families, [
        { id: "u1", partners: ["a", "b"], children: ["x", "y"] },
        { id: "u2", partners: ["c"], children: [] },
    ]);
});
