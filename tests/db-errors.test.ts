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
