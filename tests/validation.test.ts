/**
 * Familee - the address of a new tree
 *
 * The seed of the demo tree deletes whatever tree has the slug "demo", so a person must not be
 * able to give that address to a tree of their own, in any spelling the format check accepts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_SLUG, isReservedSlug, validateSlug } from "@/lib/validation";

test("a slug is trimmed, lowered and checked for its format", () => {
    assert.equal(validateSlug("  Smith-Family "), "smith-family");
    assert.equal(validateSlug("-smith"), null);
    assert.equal(validateSlug("smith family"), null);
    assert.equal(validateSlug(""), null);
});

test("the demo slug is kept for the demo tree in every spelling", () => {
    for (const raw of ["demo", "Demo", " DEMO "]) {
        const slug = validateSlug(raw);
        assert.equal(slug, DEMO_SLUG, raw);
        assert.equal(isReservedSlug(slug ?? ""), true, raw);
    }
    assert.equal(isReservedSlug("demo-family"), false);
    assert.equal(isReservedSlug("smith"), false);
});
