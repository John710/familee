/**
 * Familee - how one person is related to another
 *
 * The relation is worked out from the unions of the tree alone: the nearest common ancestor names
 * the blood relation (a mother is one generation up, a first cousin is two up and two down), a
 * partner is a spouse, and the partner of a blood relative is that relative's relation "-in-law".
 * The phrases are built elsewhere; what is checked here is the pair of numbers every phrase reads.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { type KinshipFamily, relationBetween, relationsTo } from "@/lib/kinship";

/**
 * G and M are the grandparents; F and A their children; F married Mo, A married U; S (the one we
 * ask about), Si and C are the grandchildren; Si married B and had N.
 */
const FAMILIES: KinshipFamily[] = [
    { partners: ["G", "M"], children: ["F", "A"] },
    { partners: ["F", "Mo"], children: ["S", "Si"] },
    { partners: ["A", "U"], children: ["C"] },
    { partners: ["Si", "B"], children: ["N"] },
];

const EVERYONE = ["G", "M", "F", "Mo", "A", "U", "S", "Si", "C", "B", "N"];

function relationOf(personId: string): string {
    const relation = relationsTo("S", FAMILIES, EVERYONE).get(personId);
    if (!relation) return "none";
    if (relation.kind === "blood" || relation.kind === "inLaw") {
        return `${relation.kind}:${relation.up}:${relation.down}`;
    }
    return relation.kind;
}

test("names the closest relative, not the farthest ancestor", () => {
    assert.equal(relationOf("S"), "self");
    assert.equal(relationOf("Mo"), "blood:1:0"); // mother
    assert.equal(relationOf("F"), "blood:1:0"); // father
    assert.equal(relationOf("Si"), "blood:1:1"); // sister
    assert.equal(relationOf("N"), "blood:1:2"); // nephew
    assert.equal(relationOf("G"), "blood:2:0"); // grandfather
    assert.equal(relationOf("A"), "blood:2:1"); // aunt
    assert.equal(relationOf("C"), "blood:2:2"); // first cousin
});

test("calls a partner a spouse and their partner a relation-in-law", () => {
    // Nobody is married to S in this tree, so B is only known as the husband of the sister.
    assert.equal(relationOf("B"), "inLaw:1:1");
    assert.equal(relationOf("U"), "inLaw:2:1"); // the husband of the aunt
});

test("reads the same relation from the other side", () => {
    // The grandfather is two generations above his grandchild, who is two below him.
    assert.deepEqual(relationBetween("G", "C", FAMILIES), { kind: "blood", up: 2, down: 0 });
    assert.deepEqual(relationBetween("C", "G", FAMILIES), { kind: "blood", up: 0, down: 2 });
    assert.deepEqual(relationBetween("F", "C", FAMILIES), { kind: "blood", up: 2, down: 1 });
});

test("says nothing about people with no link", () => {
    const strangers: KinshipFamily[] = [...FAMILIES, { partners: ["X", "Y"], children: ["Z"] }];
    const relations = relationsTo("S", strangers, [...EVERYONE, "X", "Y", "Z"]);

    assert.equal(relations.has("Z"), false);
    assert.equal(relationBetween("S", "Z", strangers), null);
    // A person is their own relation, always.
    assert.deepEqual(relationBetween("S", "S", strangers), { kind: "self" });
});

test("walks a loop in the data without running away", () => {
    // The database refuses a cycle, but an old tree could still carry one; the walk must end.
    const loop: KinshipFamily[] = [
        { partners: ["A", "B"], children: ["C"] },
        { partners: ["C"], children: ["A"] },
    ];
    const relations = relationsTo("C", loop, ["A", "B", "C"]);

    assert.ok(relations.get("C"));
    assert.ok(relations.get("A"));
});
