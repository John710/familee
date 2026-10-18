/**
 * Familee - the picture of a tree
 *
 * The export draws the cards and the lines of the canvas as an SVG that leaves the screen: it has
 * to hold every card of the tree, write the name on each one and keep the whole thing within its
 * own size. The wrapping of a long name and the corners of a bent line are read here as well, since
 * they decide what the picture looks like.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
    edgePoints,
    initials,
    roundedPath,
    textWidth,
    treeImage,
    treeImageFileName,
    wrapLines,
} from "@/lib/tree-image";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/tree-layout";
import type { FlowEdge, FlowNode, PersonNodeData } from "@/lib/tree-view";

function personData(personId: string, name: string, extra: Partial<PersonNodeData> = {}) {
    const data: PersonNodeData = {
        personId,
        name,
        birthYear: null,
        deathYear: null,
        isLiving: null,
        sex: "unknown",
        href: `/trees/family/persons/${personId}`,
        photoUrl: null,
        photoCrop: null,
        photoRatio: null,
        isSelf: false,
        kinship: null,
        age: null,
        birthday: null,
        details: { notes: "", timeline: [] },
        albumHref: `/trees/family/gallery/${personId}`,
    };
    return { ...data, ...extra };
}

function personNode(id: string, x: number, y: number, extra: Partial<PersonNodeData> = {}) {
    const node: FlowNode = {
        id: `person-${id}`,
        type: "person",
        position: { x, y },
        data: personData(id, id, extra),
    };
    return node;
}

function unionNode(id: string, x: number, y: number): FlowNode {
    return { id: `union-${id}`, type: "union", position: { x, y }, data: { familyId: id } };
}

/** Two parents, one union and one child: the smallest tree that has both kinds of line. */
function family(): { nodes: FlowNode[]; edges: FlowEdge[] } {
    return {
        nodes: [
            personNode("ivan", 0, 0, { name: "Ivan Petrov", sex: "male" }),
            personNode("maria", CARD_WIDTH + 32, 0, { name: "Maria Petrova", sex: "female" }),
            unionNode("u1", CARD_WIDTH + 16 + 2, CARD_HEIGHT / 2 - 6),
            personNode("anna", 148, 188, { name: "Anna Petrova", sex: "male" }),
        ],
        edges: [
            {
                id: "partner-u1-ivan",
                source: "person-ivan",
                sourceHandle: "right",
                target: "union-u1",
                targetHandle: "left",
                type: "straight",
                tone: "male",
            },
            {
                id: "partner-u1-maria",
                source: "union-u1",
                sourceHandle: "right",
                target: "person-maria",
                targetHandle: "left",
                type: "straight",
                tone: "female",
            },
            {
                id: "child-u1-anna",
                source: "union-u1",
                sourceHandle: "bottom",
                target: "person-anna",
                targetHandle: "top",
                type: "smoothstep",
                tone: "male",
            },
        ],
    };
}

test("the monogram is the first letters of the first two words", () => {
    assert.equal(initials("ivan petrov"), "IP");
    assert.equal(initials("Anna"), "A");
    assert.equal(initials(""), "");
});

test("a long name is wrapped by its width and then cut with an ellipsis", () => {
    const size = 13;
    const width = (text: string) => textWidth(text, size);

    // Nothing to write.
    assert.deepEqual(wrapLines("   ", 148, 2, size), []);
    // One line is enough when it is wide enough.
    assert.deepEqual(wrapLines("Ivan Ivanovich Petrov", 148, 2, size), ["Ivan Ivanovich Petrov"]);
    // The second word goes to the next line when the first fills it.
    assert.deepEqual(wrapLines("Ivan Ivanovich Petrov", width("Ivan Ivanovich"), 2, size), [
        "Ivan Ivanovich",
        "Petrov",
    ]);
    // No room for the third word: the last line carries an ellipsis.
    assert.deepEqual(wrapLines("Ivan Ivanovich Petrov Sokolov", width("Ivan Ivanovich"), 2, size), [
        "Ivan Ivanovich",
        "Petrov…",
    ]);
    // A single word wider than the line is cut where the line ends; the ellipsis takes the room
    // of the letter it replaces.
    assert.deepEqual(wrapLines("Sokolov-Ivanovsky", width("Sokolov"), 1, size), ["Sokolo…"]);
});

test("no line of a name is wider than the card", () => {
    const size = 13;
    const room = CARD_WIDTH - 92 - 24;
    const names = [
        "Иван Викторович Соколов",
        "Maria Magdalena Theresia von Habsburg",
        "Вольфганг-Амадей Моцарт",
        "SOKOLOV-IVANOVSKY",
        "Anna",
    ];
    for (const name of names) {
        const lines = wrapLines(name, room, 2, size);
        assert.ok(lines.length >= 1 && lines.length <= 2, name);
        for (const line of lines) {
            assert.ok(textWidth(line, size) <= room, `${name}: ${line}`);
        }
    }
});

test("a letter is as wide as what it is", () => {
    assert.equal(textWidth("", 10), 0);
    // A capital takes more room than a narrow letter, and a space the least.
    assert.ok(textWidth("W", 10) > textWidth("l", 10));
    assert.ok(textWidth("lll", 10) > textWidth("   ", 10));
    assert.equal(textWidth("ab", 10), textWidth("ab", 5) * 2);
});

test("a straight line keeps its corners to itself", () => {
    const path = roundedPath(
        [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ],
        8,
    );
    assert.equal(path, "M 0 0 L 100 0");
    assert.equal(roundedPath([{ x: 1, y: 1 }], 8), "");

    // A bend is rounded, and never by more than half of the shorter side.
    const bent = roundedPath(
        [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 4 },
        ],
        8,
    );
    assert.match(bent, /^M 0 0 L \d+ 0 Q 100 0 100 \d+ L 100 4$/);
    assert.ok(bent.includes("Q 100 0 100 2"), bent);
});

test("a line steps halfway between two cards", () => {
    const from = { x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT };
    const to = { x: 148, y: 188, w: CARD_WIDTH, h: CARD_HEIGHT };

    const down = edgePoints(from, "bottom", to, "top");
    assert.deepEqual(down, [
        { x: CARD_WIDTH / 2, y: CARD_HEIGHT },
        { x: CARD_WIDTH / 2, y: (CARD_HEIGHT + 188) / 2 },
        { x: 148 + CARD_WIDTH / 2, y: (CARD_HEIGHT + 188) / 2 },
        { x: 148 + CARD_WIDTH / 2, y: 188 },
    ]);

    const across = edgePoints(
        from,
        "right",
        { x: 296, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT },
        "left",
    );
    assert.deepEqual(across, [
        { x: CARD_WIDTH, y: CARD_HEIGHT / 2 },
        { x: (CARD_WIDTH + 296) / 2, y: CARD_HEIGHT / 2 },
        { x: (CARD_WIDTH + 296) / 2, y: CARD_HEIGHT / 2 },
        { x: 296, y: CARD_HEIGHT / 2 },
    ]);

    // A line that leaves from above and arrives from the side needs one corner only.
    const mixed = edgePoints(from, "bottom", { x: 400, y: 200, w: 0, h: 0 }, "left");
    assert.deepEqual(mixed, [
        { x: CARD_WIDTH / 2, y: CARD_HEIGHT },
        { x: CARD_WIDTH / 2, y: 200 },
        { x: 400, y: 200 },
    ]);
});

test("the picture holds every card and writes the names on them", () => {
    const { nodes, edges } = family();
    const image = treeImage({
        title: "Petrov family",
        nodes,
        edges,
        labels: { unknown: "Unknown", you: "You" },
    });

    // The width is the two parents with their gap, the height the child's row; the margin and the
    // band above the drawing are added around them.
    assert.equal(image.width, CARD_WIDTH * 2 + 32 + 80);
    assert.equal(image.height, 188 + CARD_HEIGHT + 80 + 76);
    assert.ok(image.svg.startsWith("<svg "));
    assert.ok(image.svg.endsWith("</svg>"));
    for (const name of ["Ivan Petrov", "Maria Petrova", "Anna Petrova"]) {
        assert.ok(image.svg.includes(`>${name}<`), name);
    }
    // Three lines and one junction.
    assert.equal(image.svg.split("<path ").length - 1, 3);
    assert.equal(image.svg.split("<circle ").length - 1, 1);
    // A card, its monogram and its two lines.
    assert.equal(image.svg.split('rx="12"').length - 1, 3);
    assert.ok(image.svg.includes(`>IP<`));
    assert.equal(image.height > 0 && image.width > 0, true);
});

test("a line takes the colour of the person it ends at", () => {
    const { nodes, edges } = family();
    const image = treeImage({
        title: "Petrov family",
        nodes,
        edges,
        labels: { unknown: "Unknown", you: "You" },
    });

    // Ivan is a man, Maria a woman and Anna a man again: their lines are blue and pink.
    assert.ok(image.svg.includes('stroke="#00a5ef"'));
    assert.ok(image.svg.includes('stroke="#fb64b6"'));

    // A sex nobody recorded keeps the calm grey of a line.
    const unknown = treeImage({
        title: "Petrov family",
        nodes: [unionNode("u1", 110, 0), personNode("x", 0, 188)],
        edges: [
            {
                id: "child-u1-x",
                source: "union-u1",
                sourceHandle: "bottom",
                target: "person-x",
                targetHandle: "top",
                type: "smoothstep",
                tone: "unknown",
            },
        ],
        labels: { unknown: "Unknown", you: "You" },
    });
    assert.ok(unknown.svg.includes('stroke="#9ca3af"'));
});

test("a title with a bracket and a name with an ampersand stay text", () => {
    const image = treeImage({
        title: "Petrov & <friends>",
        nodes: [personNode("anna", 0, 0, { name: "Anna & <b>" })],
        edges: [],
        labels: { unknown: "Unknown", you: "You" },
    });
    assert.ok(image.svg.includes(">Petrov &amp; &lt;friends&gt;<"));
    assert.ok(image.svg.includes(">Anna &amp; &lt;b&gt;<"));
    assert.equal(image.svg.includes("<b>"), false);
});

test("the picture marks the reader's own person and the life years", () => {
    const image = treeImage({
        title: "Petrov family",
        nodes: [personNode("ivan", 0, 0, { name: "Ivan", isSelf: true, isLiving: false })],
        edges: [],
        labels: { unknown: "Unknown", you: "This is you", footer: "Familee, 17 October 2026" },
        years: () => "1900 – 1970",
    });
    assert.ok(image.svg.includes(">This is you<"));
    assert.ok(image.svg.includes(">1900 – 1970<"));
    assert.ok(image.svg.includes(">Familee, 17 October 2026<"));
    // The bar across the monogram of a person who is not alive.
    assert.ok(image.svg.includes("<line "));
});

test("a person without a name is written as unknown, and an empty tree is still a picture", () => {
    const named = treeImage({
        title: "Petrov family",
        nodes: [personNode("x", 0, 0, { name: "" })],
        edges: [],
        labels: { unknown: "Unknown", you: "You" },
    });
    assert.ok(named.svg.includes(">Unknown<"));

    const empty = treeImage({
        title: "Petrov family",
        nodes: [],
        edges: [],
        labels: { unknown: "Unknown", you: "You" },
    });
    assert.ok(empty.svg.includes(">Petrov family<"));
    assert.ok(empty.width > 0 && empty.height > 0);
});

test("the file of the picture carries the title of the tree", () => {
    assert.equal(treeImageFileName("Famille & Co", "svg"), "famille-co.svg");
    assert.equal(treeImageFileName("  Ивановы  ", "png"), "ивановы.png");
    assert.equal(treeImageFileName("!!!", "svg"), "family-tree.svg");
});
