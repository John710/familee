/**
 * Familee - which unions the tree keeps, and the extra input of the kinship
 *
 * A GEDCOM FAM with only CHIL lines is imported as a union with children and no partner. The tree
 * must still draw it, or the children lose their place; a union with nobody left is not drawn.
 * A divorced union is marked `ended`, and a child that is not a parent's by birth is listed in
 * `parentLinks`; both come out of ./kinship.ts as a former spouse and as a step or adoptive link.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { relationsTo } from "@/lib/kinship";
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
    assert.deepEqual(families, [
        { id: "u1", partners: [], children: ["kid", "sib"], ended: false, parentLinks: {} },
    ]);

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
        { id: "u1", partners: ["a", "b"], children: ["x", "y"], ended: false, parentLinks: {} },
        { id: "u2", partners: ["c"], children: [], ended: false, parentLinks: {} },
    ]);
});

test("a union with a divorce event is ended, the others are not", () => {
    const families = assembleFamilies(
        [{ id: "u1" }, { id: "u2" }],
        [
            { familyId: "u1", personId: "a" },
            { familyId: "u1", personId: "b" },
            { familyId: "u2", personId: "a" },
            { familyId: "u2", personId: "c" },
        ],
        [],
        ["u1"],
    );
    assert.deepEqual(
        families.map((family) => [family.id, family.ended]),
        [
            ["u1", true],
            ["u2", false],
        ],
    );

    const relations = relationsTo("a", families, ["b", "c"]);
    assert.deepEqual(relations.get("b"), { kind: "exSpouse" });
    assert.deepEqual(relations.get("c"), { kind: "spouse" });
});

test("a plain birth link is left out of the parent links", () => {
    const [family] = assembleFamilies(
        [{ id: "u1" }],
        [
            { familyId: "u1", personId: "a" },
            { familyId: "u1", personId: "b" },
        ],
        [
            { familyId: "u1", personId: "kid", relation: "biological", relationByPartner: {} },
            { familyId: "u1", personId: "sib" },
        ],
    );
    assert.deepEqual(family?.parentLinks, {});
});

test("the relation of a child applies to every partner of the union", () => {
    const [family] = assembleFamilies(
        [{ id: "u1" }],
        [
            { familyId: "u1", personId: "a" },
            { familyId: "u1", personId: "b" },
        ],
        [{ familyId: "u1", personId: "kid", relation: "adopted", relationByPartner: {} }],
    );
    assert.deepEqual(family?.parentLinks, { kid: { a: "adopted", b: "adopted" } });
});

test("the relation of a partner overrides the relation of the child", () => {
    const [family] = assembleFamilies(
        [{ id: "u1" }],
        [
            { familyId: "u1", personId: "mother" },
            { familyId: "u1", personId: "father" },
        ],
        [
            {
                familyId: "u1",
                personId: "kid",
                relation: "biological",
                relationByPartner: { father: "adopted", stranger: "step" },
            },
            {
                familyId: "u1",
                personId: "ward",
                relation: "step",
                relationByPartner: { mother: "biological" },
            },
        ],
    );
    // "stranger" is no partner of the union, so it gets no entry.
    assert.deepEqual(family?.parentLinks, {
        kid: { father: "adopted" },
        ward: { father: "step" },
    });

    const relations = relationsTo("father", [family ?? never()], ["kid", "ward"]);
    assert.deepEqual(relations.get("kid"), { kind: "link", link: "adoptedChild" });
    assert.deepEqual(relations.get("ward"), { kind: "link", link: "stepChild" });
});

function never(): never {
    throw new Error("the union is missing");
}
