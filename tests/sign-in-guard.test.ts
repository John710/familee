/**
 * Familee - which attempt counts against which account
 *
 * A successful sign-in must not count, a failure must; the counter of a user name must not be
 * moved by an e-mail address sent in the same body. These rules are pure, so they are tested here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    isSignInPath,
    SIGN_IN_ATTEMPTS,
    signInAllowed,
    signInAttemptsKey,
    signInFailed,
    signInIdentifier,
} from "@/lib/sign-in-guard";

test("the identifier is the field the endpoint authenticates", () => {
    assert.equal(
        signInIdentifier("/sign-in/username", { username: " Anna ", email: "decoy@example.org" }),
        "Anna",
    );
    assert.equal(
        signInIdentifier("/sign-in/email", { email: " a@b.c ", username: "decoy" }),
        "a@b.c",
    );
    assert.equal(signInIdentifier("/sign-in/email", { username: "only-a-name" }), null);
    assert.equal(signInIdentifier("/sign-in/username", { email: "only-a-mail@example.org" }), null);
    assert.equal(signInIdentifier("/sign-in/email", { email: "   " }), null);
    assert.equal(signInIdentifier("/sign-in/email", null), null);
});

test("only the sign-in endpoints are counted", () => {
    assert.equal(isSignInPath("/sign-in/email"), true);
    assert.equal(isSignInPath("/sign-in/username"), true);
    assert.equal(isSignInPath("/sign-out"), false);
    assert.equal(isSignInPath("/request-password-reset"), false);
});

test("a refusal counts, a session does not", () => {
    assert.equal(
        signInFailed({ statusCode: 401, body: { code: "INVALID_EMAIL_OR_PASSWORD" } }),
        true,
    );
    assert.equal(signInFailed({ statusCode: 403 }), true);
    assert.equal(signInFailed({ statusCode: 200, token: "t" }), false);
    assert.equal(signInFailed({ token: "t", user: { id: "u" } }), false);
    assert.equal(signInFailed(null), false);
    assert.equal(signInFailed("session"), false);
});

test("the limit is ten failed attempts, and the key ignores case and spaces", () => {
    for (let attempts = 0; attempts < SIGN_IN_ATTEMPTS; attempts += 1) {
        assert.equal(signInAllowed(attempts), true, String(attempts));
    }
    assert.equal(signInAllowed(SIGN_IN_ATTEMPTS), false);
    assert.equal(signInAllowed(SIGN_IN_ATTEMPTS + 1), false);
    assert.equal(
        signInAttemptsKey("  Anna@Example.ORG "),
        "familee:signin-attempts:anna@example.org",
    );
});
