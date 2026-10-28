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

test("calls siblings with one parent in common half-siblings", () => {
    // S and Si have both parents in common; H shares only the father with S.
    const families: KinshipFamily[] = [
        { partners: ["F", "Mo"], children: ["S", "Si"] },
        { partners: ["F", "Other"], children: ["H"] },
    ];
    const relations = relationsTo("S", families, ["F", "Mo", "Si", "H"]);

    assert.deepEqual(relations.get("Si"), { kind: "blood", up: 1, down: 1 });
    assert.deepEqual(relations.get("H"), { kind: "blood", up: 1, down: 1, half: true });
    // Seen from the other side it is the same.
    assert.deepEqual(relationBetween("S", "H", families), {
        kind: "blood",
        up: 1,
        down: 1,
        half: true,
    });
});

test("does not call siblings half when the other parent is only unknown", () => {
    // Each of them has the father on record and nobody else.
    const families: KinshipFamily[] = [
        { partners: ["F"], children: ["S"] },
        { partners: ["F"], children: ["T"] },
    ];
    assert.deepEqual(relationsTo("S", families, ["T"]).get("T"), {
        kind: "blood",
        up: 1,
        down: 1,
    });
});

test("calls the partner of a divorced union a former spouse", () => {
    const families: KinshipFamily[] = [
        { partners: ["S", "Ex"], children: [], ended: true },
        { partners: ["S", "Wife"], children: [] },
        // Married again to the same person: the union that goes on wins.
        { partners: ["S", "Again"], children: [], ended: true },
        { partners: ["S", "Again"], children: [] },
    ];
    const relations = relationsTo("S", families, ["Ex", "Wife", "Again"]);

    assert.deepEqual(relations.get("Ex"), { kind: "exSpouse" });
    assert.deepEqual(relations.get("Wife"), { kind: "spouse" });
    assert.deepEqual(relations.get("Again"), { kind: "spouse" });
});

test("names a step or adoptive link and does not count it as blood", () => {
    const families: KinshipFamily[] = [
        // S was adopted by A and B.
        {
            partners: ["A", "B"],
            children: ["S"],
            parentLinks: { S: { A: "adopted", B: "adopted" } },
        },
        // S's stepchild: the child of S's wife by somebody else, linked to S as a step parent.
        {
            partners: ["S", "Wife"],
            children: ["Kid"],
            parentLinks: { Kid: { S: "step" } },
        },
    ];
    const relations = relationsTo("S", families, ["A", "B", "Kid", "Wife"]);

    assert.deepEqual(relations.get("A"), { kind: "link", link: "adoptiveParent" });
    assert.deepEqual(relations.get("B"), { kind: "link", link: "adoptiveParent" });
    assert.deepEqual(relations.get("Kid"), { kind: "link", link: "stepChild" });
    assert.deepEqual(relations.get("Wife"), { kind: "spouse" });

    // From Kid's side S is the step parent.
    assert.deepEqual(relationBetween("S", "Kid", families), { kind: "link", link: "stepParent" });
    // The adopted child is the adoptive parents' child.
    assert.deepEqual(relationBetween("S", "A", families), { kind: "link", link: "adoptedChild" });
});

test("a link that is biological for one parent stays blood for that parent", () => {
    // Adopted by the father only: the mother is the real one.
    const families: KinshipFamily[] = [
        {
            partners: ["Dad", "Mum"],
            children: ["S"],
            parentLinks: { S: { Dad: "adopted" } },
        },
    ];
    const relations = relationsTo("S", families, ["Dad", "Mum"]);

    assert.deepEqual(relations.get("Dad"), { kind: "link", link: "adoptiveParent" });
    assert.deepEqual(relations.get("Mum"), { kind: "blood", up: 1, down: 0 });
});

test("a step child leads to no relatives of the step parent", () => {
    const families: KinshipFamily[] = [
        { partners: ["Gf", "Gm"], children: ["Step"] },
        { partners: ["Step", "Mum"], children: ["Kid"], parentLinks: { Kid: { Step: "step" } } },
    ];
    // Kid is a stepchild of Step, so Step's parents are not Kid's grandparents.
    const relations = relationsTo("Kid", families, ["Step", "Gf", "Gm", "Mum"]);

    assert.deepEqual(relations.get("Step"), { kind: "link", link: "stepParent" });
    assert.equal(relations.has("Gf"), false);
    assert.deepEqual(relations.get("Mum"), { kind: "blood", up: 1, down: 0 });
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
