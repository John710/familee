/**
 * Familee - the return address after sign-in
 *
 * ?next=... must never send a person to another site. Browsers strip tabs and line breaks from a
 * URL, so "/\t/evil.example" is "//evil.example" by the time it is followed; the cases below are
 * the ways a path can name a host of its own, and the ordinary paths that must still work.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { safeNextPath } from "@/lib/safe-path";

test("a path inside the site is kept as it is", () => {
    assert.equal(safeNextPath("/trees/smith/members"), "/trees/smith/members");
    assert.equal(safeNextPath("/trees/smith?q=anna#top"), "/trees/smith?q=anna#top");
    assert.equal(safeNextPath("/"), "/");
});

test("nothing given means the list of trees", () => {
    assert.equal(safeNextPath(undefined), "/trees");
    assert.equal(safeNextPath(""), "/trees");
});

test("an address with a scheme or a host is refused", () => {
    for (const raw of [
        "https://evil.example",
        "//evil.example",
        "/\\evil.example",
        "\\\\evil.example",
        "javascript:alert(1)",
        "trees",
    ]) {
        assert.equal(safeNextPath(raw), "/trees", JSON.stringify(raw));
    }
});

test("a tab, a line break or any control character cannot hide a second slash", () => {
    // What ?next=%2F%09%2Fevil.example arrives as once the query is decoded.
    assert.equal(safeNextPath("/\t/evil.example"), "/trees");
    for (const char of ["\n", "\r", "\u0000", "\u001f", "\u007f", " ", " ", " "]) {
        const raw = `/${char}/evil.example`;
        assert.equal(safeNextPath(raw), "/trees", JSON.stringify(raw));
    }
    assert.equal(safeNextPath("/trees/smith\n"), "/trees");
});
