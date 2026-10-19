/**
 * Familee - reading a version, and knowing when a release is newer
 *
 * The footer announces an update from the answer of GitHub, so the rule behind it is worth pinning
 * here: a tag with or without the "v", the parts compared as numbers rather than as text, a short
 * version zero-padded, and a tag nobody can read never counting as an update.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { compareVersions, isNewer, parseVersion, versionFromRelease } from "@/lib/app-version";

test("a version is read with the v and without it", () => {
    assert.deepEqual(parseVersion("0.5.1"), [0, 5, 1]);
    assert.deepEqual(parseVersion("v0.5.1"), [0, 5, 1]);
    assert.deepEqual(parseVersion("V1.0.0"), [1, 0, 0]);
    assert.deepEqual(parseVersion("  0.5.1  "), [0, 5, 1]);
    assert.deepEqual(parseVersion("1"), [1]);
});

test("a tag that is not a plain version reads as nothing", () => {
    assert.equal(parseVersion("nightly"), null);
    assert.equal(parseVersion("0.6.0-rc.1"), null);
    assert.equal(parseVersion("v"), null);
    assert.equal(parseVersion("0..1"), null);
    assert.equal(parseVersion("1.2.x"), null);
    assert.equal(parseVersion(""), null);
    assert.equal(parseVersion(null), null);
    assert.equal(parseVersion(undefined), null);
});

test("the later version wins, part by part", () => {
    assert.equal(compareVersions("0.6.0", "0.5.1"), 1);
    assert.equal(compareVersions("0.5.1", "0.6.0"), -1);
    assert.equal(compareVersions("0.5.1", "0.5.1"), 0);
    assert.equal(compareVersions("v0.5.1", "0.5.1"), 0);
    /** Ten parts are ten, not a letter after a one. */
    assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
    assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
    /** A version that stops early is zero-padded. */
    assert.equal(compareVersions("0.6", "0.6.0"), 0);
    assert.equal(compareVersions("0.6.1", "0.6"), 1);
    assert.equal(compareVersions("0.6", "0.5.9"), 1);
    /** No order to give. */
    assert.equal(compareVersions("0.6.0-rc.1", "0.5.1"), null);
    assert.equal(compareVersions("0.6.0", "nightly"), null);
});

test("an update is announced only for a version that is really newer", () => {
    assert.equal(isNewer("0.6.0", "0.5.1"), true);
    assert.equal(isNewer("v0.6.0", "0.5.1"), true);
    assert.equal(isNewer("0.5.1", "0.5.1"), false);
    assert.equal(isNewer("0.5.0", "0.5.1"), false);
    assert.equal(isNewer("nightly", "0.5.1"), false);
    assert.equal(isNewer("0.6.0", "not a version"), false);
});

test("a release carries its version in the tag", () => {
    assert.equal(versionFromRelease({ tag_name: "v0.6.0" }), "0.6.0");
    assert.equal(versionFromRelease({ tag_name: "0.6.0" }), "0.6.0");
    assert.equal(versionFromRelease({ tag_name: "nightly" }), null);
    assert.equal(versionFromRelease({ tag_name: 42 }), null);
    assert.equal(versionFromRelease({}), null);
    assert.equal(versionFromRelease([]), null);
    assert.equal(versionFromRelease(null), null);
    assert.equal(versionFromRelease("v0.6.0"), null);
});
