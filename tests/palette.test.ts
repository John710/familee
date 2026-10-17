/**
 * Familee - the pages the palette offers and the moving of its selection
 *
 * The window that opens on Ctrl+K must not offer a page its reader may not open - the pages
 * themselves refuse them, so the offer has to be filtered by role - and the selection has to walk
 * round the ends of the list, because the arrows are how the window is used.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    clampSelection,
    commandHref,
    commandsFor,
    moveSelection,
    selectedItem,
    TREE_COMMANDS,
    treeSlugOf,
} from "@/lib/palette";
import type { MEMBER_ROLES } from "@/lib/roles";

const keysOf = (role: (typeof MEMBER_ROLES)[number]) => commandsFor(role).map((one) => one.key);

test("a reader is offered only the pages their role may open", () => {
    const viewer = keysOf("viewer");
    assert.ok(viewer.includes("people"));
    assert.ok(viewer.includes("photos"));
    assert.ok(viewer.includes("members"));
    // The pages that keep a viewer out.
    assert.equal(viewer.includes("duplicates"), false);
    assert.equal(viewer.includes("trash"), false);
    assert.equal(viewer.includes("import"), false);
    assert.equal(viewer.includes("history"), false);

    const editor = keysOf("editor");
    assert.ok(editor.includes("duplicates"));
    assert.ok(editor.includes("trash"));
    assert.ok(editor.includes("import"));
    // The history is for the owner and the administrators.
    assert.equal(editor.includes("history"), false);

    assert.ok(keysOf("admin").includes("history"));
});

test("the owner is offered every page the window knows", () => {
    assert.equal(keysOf("owner").length, TREE_COMMANDS.length);
});

test("the address of a page carries the tree", () => {
    const people = TREE_COMMANDS.find((command) => command.key === "people");
    assert.ok(people);
    assert.equal(commandHref("ivanov", people), "/trees/ivanov/persons");
    assert.equal(
        commandHref("ivanov", { key: "tree", path: "tree", role: "" }),
        "/trees/ivanov/tree",
    );
});

test("the selection walks round the ends of the list", () => {
    assert.equal(moveSelection(0, 1, 3), 1);
    assert.equal(moveSelection(2, 1, 3), 0);
    assert.equal(moveSelection(0, -1, 3), 2);
    assert.equal(moveSelection(1, -1, 3), 0);
    // A long jump is the same as its remainder, in both directions.
    assert.equal(moveSelection(0, 7, 3), 1);
    assert.equal(moveSelection(0, -7, 3), 2);
    // A single page and an empty list.
    assert.equal(moveSelection(0, 1, 1), 0);
    assert.equal(moveSelection(0, 1, 0), -1);
});

test("the selection stays on the list when the list changes", () => {
    assert.equal(clampSelection(5, 3), 2);
    assert.equal(clampSelection(-2, 3), 0);
    assert.equal(clampSelection(1, 3), 1);
    assert.equal(clampSelection(0, 0), -1);
});

test("nothing is selected on an empty list", () => {
    assert.equal(selectedItem([], 0), null);
    assert.equal(selectedItem(["a", "b"], 5), null);
    assert.equal(selectedItem(["a", "b"], -1), null);
    assert.equal(selectedItem(["a", "b"], 1), "b");
});

test("the tree is read from the address", () => {
    assert.equal(treeSlugOf("/trees/ivanov/persons"), "ivanov");
    assert.equal(treeSlugOf("/trees/ivanov"), "ivanov");
    assert.equal(treeSlugOf("/trees/ivanov?q=x"), "ivanov");
    assert.equal(treeSlugOf("/trees/ivanov#top"), "ivanov");
    // The addresses that are not inside a tree.
    assert.equal(treeSlugOf("/trees"), null);
    assert.equal(treeSlugOf("/"), null);
    assert.equal(treeSlugOf("/trees//persons"), null);
    // A slug that had to be escaped in the address.
    assert.equal(treeSlugOf("/trees/a%20b/persons"), "a b");
});
