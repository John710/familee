/**
 * Familee - which attempt counts against which account
 *
 * A successful sign-in must not stay counted, a failure must; every attempt is judged by the count
 * its own reservation produced; the counter of a user name must not be moved by an e-mail address
 * sent in the same body, and a user name shares the counter of its account's e-mail address.
 * These rules are pure, so they are tested here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    isSignInPath,
    SIGN_IN_ATTEMPTS,
    signInAllowed,
    signInAttemptsKey,
    signInCounterName,
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

test("the limit is ten reserved attempts, and the key ignores case and spaces", () => {
    // Each attempt is judged by the count its own reservation produced: 1 for the first.
    for (let reserved = 1; reserved <= SIGN_IN_ATTEMPTS; reserved += 1) {
        assert.equal(signInAllowed(reserved), true, String(reserved));
    }
    assert.equal(signInAllowed(SIGN_IN_ATTEMPTS + 1), false);
    assert.equal(signInAllowed(SIGN_IN_ATTEMPTS + 2), false);
    assert.equal(
        signInAttemptsKey("  Anna@Example.ORG "),
        "familee:signin-attempts:anna@example.org",
    );
});

test("parallel attempts cannot all pass one reading of the counter", () => {
    // Twenty requests sent at once each take their own place with one atomic increment, so
    // they see 1..20 and only the first ten reach the password check.
    const counts = Array.from({ length: 20 }, (_, index) => index + 1);
    assert.equal(counts.filter((count) => signInAllowed(count)).length, SIGN_IN_ATTEMPTS);
});

test("a user name and an e-mail address of one account share one counter", () => {
    const byEmail = signInAttemptsKey(signInCounterName("Anna@Example.org", null));
    const byName = signInAttemptsKey(signInCounterName("anna", "anna@example.org"));
    assert.equal(byName, byEmail);

    // A name no account has is still counted, under its own key.
    assert.equal(
        signInAttemptsKey(signInCounterName("Nobody", null)),
        "familee:signin-attempts:nobody",
    );
});
