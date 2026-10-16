/**
 * Familee - placing the cards of the visual tree
 *
 * The canvas reads the corner of every card and the centre of every union's junction from here.
 * Rows run top to bottom, the partners of a union share a row, a child sits exactly one row below
 * its parents, and every person gets exactly one card - the union that brings them in places it,
 * and the other unions draw their lines to it.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { CARD_HEIGHT, CARD_WIDTH, type LayoutFamily, layoutTree, ROW_GAP } from "@/lib/tree-layout";

/** The corner of every card, so a test can look for overlaps. */
function cards(layout: ReturnType<typeof layoutTree>) {
    return [...layout.persons.entries()].map(([id, point]) => ({
        id,
        left: point.x,
        right: point.x + CARD_WIDTH,
        top: point.y,
        bottom: point.y + CARD_HEIGHT,
    }));
}

function overlaps(layout: ReturnType<typeof layoutTree>): string[] {
    const boxes = cards(layout);
    const found: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            if (!a || !b) continue;
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
                found.push(`${a.id}/${b.id}`);
            }
        }
    }
    return found;
}

test("a single person gets one card at the top left", () => {
    const layout = layoutTree(["a"], []);

    assert.deepEqual(layout.persons.get("a"), { x: 0, y: 0, generation: 0 });
    assert.equal(layout.unions.size, 0);
    assert.equal(layout.width, CARD_WIDTH);
    assert.equal(layout.height, CARD_HEIGHT);
});

test("the partners of a union share a row and the children sit a row below", () => {
    const families: LayoutFamily[] = [
        { id: "u1", partners: ["dad", "mom"], children: ["kid1", "kid2"] },
    ];
    const layout = layoutTree(["dad", "mom", "kid1", "kid2"], families);

    const dad = layout.persons.get("dad");
    const mom = layout.persons.get("mom");
    const kid1 = layout.persons.get("kid1");
    const kid2 = layout.persons.get("kid2");

    // Side by side, one GAP apart, both in the first row.
    assert.deepEqual(dad, { x: 0, y: 0, generation: 0 });
    assert.equal(mom?.x, CARD_WIDTH + 32);
    assert.equal(mom?.y, dad?.y);
    assert.equal(mom?.generation, 0);

    // The children fill the row below, under the pair.
    assert.equal(kid1?.y, CARD_HEIGHT + ROW_GAP);
    assert.equal(kid2?.y, kid1?.y);
    assert.equal(kid1?.generation, 1);
    assert.equal(kid2?.x, kid1 ? kid1.x + CARD_WIDTH + 32 : null);

    // The junction sits between the two cards, at the middle of their row.
    assert.deepEqual(layout.unions.get("u1"), { x: CARD_WIDTH + 16, y: CARD_HEIGHT / 2 });

    assert.equal(layout.height, kid1 ? kid1.y + CARD_HEIGHT : null);
    assert.deepEqual(overlaps(layout), []);
});

test("a partner without parents of their own is lifted to the row of the other one", () => {
    const families: LayoutFamily[] = [
        { id: "u1", partners: ["dad", "mom"], children: ["kid"] },
        { id: "u2", partners: ["kid", "spouse"], children: ["grandkid"] },
    ];
    const layout = layoutTree(["dad", "mom", "kid", "spouse", "grandkid"], families);

    // The spouse is nobody's child, but shares the row of the one they married.
    assert.equal(layout.persons.get("spouse")?.generation, layout.persons.get("kid")?.generation);
    assert.equal(layout.persons.get("kid")?.generation, 1);
    assert.equal(layout.persons.get("grandkid")?.generation, 2);
    assert.equal(layout.persons.get("grandkid")?.y, 2 * (CARD_HEIGHT + ROW_GAP));

    // Two unions in the same family block: both junctions are drawn.
    assert.equal(layout.unions.size, 2);
    assert.equal(layout.persons.size, 5);
    assert.deepEqual(overlaps(layout), []);
});

test("a person married twice keeps exactly one card", () => {
    const families: LayoutFamily[] = [
        { id: "u1", partners: ["a", "b"], children: [] },
        { id: "u2", partners: ["a", "c"], children: [] },
    ];
    const layout = layoutTree(["a", "b", "c"], families);

    assert.equal(layout.persons.size, 3);
    assert.deepEqual(layout.persons.get("a"), { x: 0, y: 0, generation: 0 });
    assert.deepEqual(layout.persons.get("b"), { x: CARD_WIDTH + 32, y: 0, generation: 0 });

    // The second union is a block of its own, since its partner is placed already, and its line
    // reaches back to the card of the first one.
    const second = layout.unions.get("u2");
    const c = layout.persons.get("c");
    assert.ok(second && c);
    assert.equal(second.x, c.x + CARD_WIDTH / 2);
    assert.ok(layout.width >= c.x + CARD_WIDTH);
    assert.deepEqual(overlaps(layout), []);
});

test("a partner the tree does not know is left out", () => {
    const layout = layoutTree(["a"], [{ id: "u1", partners: ["a", "ghost"], children: [] }]);

    assert.equal(layout.persons.size, 1);
    assert.equal(layout.persons.get("a")?.x, 0);

    // One partner and no children: the junction hangs below the card, above the next row.
    const junction = layout.unions.get("u1");
    assert.equal(junction?.x, CARD_WIDTH / 2);
    assert.ok(junction && junction.y > CARD_HEIGHT, "the junction should hang below the card");
    assert.ok(junction && junction.y < CARD_HEIGHT + ROW_GAP, "and above the next row");
});

test("two separate families stand side by side on the canvas", () => {
    const families: LayoutFamily[] = [
        { id: "u1", partners: ["a", "b"], children: [] },
        { id: "u2", partners: ["c", "d"], children: [] },
    ];
    const layout = layoutTree(["a", "b", "c", "d"], families);

    // The second block starts after the first one plus the space between groups.
    assert.equal(layout.persons.get("c")?.x, CARD_WIDTH * 2 + 32 + 96);
    assert.equal(layout.persons.get("c")?.y, 0);
    assert.deepEqual(overlaps(layout), []);
});

test("a union with no partner at all places its children in the first row", () => {
    // A record the database allows: a union kept only for its children.
    const layout = layoutTree(["kid"], [{ id: "u1", partners: [], children: ["kid"] }]);

    assert.equal(layout.persons.get("kid")?.y, 0);
    assert.ok(layout.unions.get("u1"));
});
