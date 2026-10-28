/**
 * Familee - reading the SQLSTATE of a database error
 *
 * Drizzle wraps what postgres.js throws and keeps the original in `cause`; the callers must still
 * tell a unique, foreign-key or check violation apart, or a duplicate and a place inside itself
 * would surface as an error page.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    errorText,
    isCheckViolation,
    isForeignKeyViolation,
    isUniqueViolation,
    mergeErrorKey,
    pedigreeErrorKey,
} from "@/lib/db-errors";

test("the code is read from the error itself", () => {
    assert.equal(isUniqueViolation({ code: "23505" }), true);
    assert.equal(isForeignKeyViolation({ code: "23503" }), true);
    assert.equal(isCheckViolation({ code: "23514" }), true);
});

test("the code is read through the cause a wrapper keeps", () => {
    const wrapped = new Error("Failed query", { cause: { code: "23514" } });
    assert.equal(isCheckViolation(wrapped), true);
    assert.equal(isUniqueViolation(wrapped), false);
});

test("other errors and non-errors are not violations", () => {
    assert.equal(isUniqueViolation({ code: "23503" }), false);
    assert.equal(isForeignKeyViolation(new Error("boom")), false);
    assert.equal(isCheckViolation(null), false);
    assert.equal(isCheckViolation("23514"), false);
});

test("the text of the cause is part of the text of the error", () => {
    const wrapped = new Error("Failed query: insert", {
        cause: new Error("familee.family_children: would make 1 its own ancestor"),
    });
    assert.match(errorText(wrapped), /own ancestor/);
    assert.match(errorText(wrapped), /Failed query/);
    assert.equal(errorText("plain"), "plain");
    assert.equal(errorText(undefined), "");
});

test("a cause that points back at itself does not loop", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    assert.equal(isUniqueViolation(loop), false);
});

/** An error shaped like the one drizzle-orm throws: "Failed query" with the driver error inside. */
function drizzleError(cause: { code?: string; message: string }): Error {
    return new Error("Failed query: insert into ... params: 1,2", { cause });
}

test("a DrizzleQueryError-like error shows the SQLSTATE and the text of its cause", () => {
    const wrapped = drizzleError({ code: "23505", message: "duplicate key value" });
    assert.equal(isUniqueViolation(wrapped), true);
    assert.equal(isCheckViolation(wrapped), false);
    assert.match(errorText(wrapped), /duplicate key value/);
});

test("the pedigree triggers are told apart through the wrapper", () => {
    const cycle = drizzleError({
        message: "familee.family_children: person 1 would become their own ancestor",
    });
    const closed = drizzleError({
        message: "familee.family_partners: partner 1 closes a pedigree cycle through 2",
    });
    const partner = drizzleError({
        message: "familee.family_children: person 1 is already a partner of family 2",
    });
    const tree = drizzleError({ message: "familee.events: place 1 belongs to another tree" });
    assert.equal(pedigreeErrorKey(cycle), "errors.cycle");
    assert.equal(pedigreeErrorKey(closed), "errors.cycle");
    assert.equal(pedigreeErrorKey(partner), "errors.duplicatePartner");
    assert.equal(pedigreeErrorKey(tree), "errors.crossTree");
    assert.equal(pedigreeErrorKey(drizzleError({ message: "boom" })), null);
    assert.equal(pedigreeErrorKey(undefined), null);
});

test("the markers of the merge functions become message keys through the wrapper", () => {
    const self = drizzleError({ message: "familee.merge_persons: merge_self" });
    const missing = drizzleError({ message: "familee.merge_places: merge_not_found" });
    const cycle = drizzleError({ message: "person 1 would become their own ancestor" });
    assert.equal(mergeErrorKey(self, "person"), "duplicates.samePerson");
    assert.equal(mergeErrorKey(self, "place"), "duplicates.sameRecord");
    assert.equal(mergeErrorKey(self, "source"), "duplicates.sameRecord");
    assert.equal(mergeErrorKey(missing, "person"), "duplicates.notFound");
    assert.equal(mergeErrorKey(missing, "place"), "place.notFound");
    assert.equal(mergeErrorKey(missing, "source"), "source.notFound");
    assert.equal(mergeErrorKey(cycle, "person"), "errors.cycle");
    assert.equal(mergeErrorKey(cycle, "place"), "errors.generic");
    assert.equal(mergeErrorKey(new Error("boom"), "person"), "errors.generic");
});
