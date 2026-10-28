/**
 * Familee - the Range header a media player sends
 *
 * A wrong answer here is a film that will not seek or a download that hangs, so the cases are
 * spelled out: a prefix, a suffix, an open end, several ranges, and a range beyond the file.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { contentRange, parseByteRange } from "@/lib/http-range";

test("no header means the whole file", () => {
    assert.deepEqual(parseByteRange(null, 100), { kind: "full" });
    assert.deepEqual(parseByteRange("", 100), { kind: "full" });
});

test("a prefix range is answered with the bytes asked for", () => {
    assert.deepEqual(parseByteRange("bytes=0-99", 1000), { kind: "range", start: 0, end: 99 });
    assert.deepEqual(parseByteRange("bytes=200-299", 1000), {
        kind: "range",
        start: 200,
        end: 299,
    });
});

test("an open end runs to the end of the file", () => {
    assert.deepEqual(parseByteRange("bytes=500-", 1000), { kind: "range", start: 500, end: 999 });
});

test("a suffix range gives the last bytes", () => {
    assert.deepEqual(parseByteRange("bytes=-100", 1000), { kind: "range", start: 900, end: 999 });
    // More bytes than the file has: the whole file is the answer.
    assert.deepEqual(parseByteRange("bytes=-5000", 1000), { kind: "range", start: 0, end: 999 });
});

test("an end beyond the file is pulled back to the last byte", () => {
    assert.deepEqual(parseByteRange("bytes=0-99999", 1000), { kind: "range", start: 0, end: 999 });
});

test("a range that starts beyond the file is refused", () => {
    assert.deepEqual(parseByteRange("bytes=1000-1100", 1000), { kind: "unsatisfiable" });
    assert.deepEqual(parseByteRange("bytes=5000-", 1000), { kind: "unsatisfiable" });
});

test("several ranges and broken headers fall back to the whole file", () => {
    assert.deepEqual(parseByteRange("bytes=0-9,20-29", 1000), { kind: "full" });
    assert.deepEqual(parseByteRange("bytes=abc", 1000), { kind: "full" });
    assert.deepEqual(parseByteRange("items=0-9", 1000), { kind: "full" });
    assert.deepEqual(parseByteRange("bytes=-", 1000), { kind: "full" });
});

test("a reversed range is ignored, and an empty file cannot be ranged", () => {
    // RFC 9110: a syntactically invalid range is ignored, so the whole file is answered.
    assert.deepEqual(parseByteRange("bytes=500-100", 1000), { kind: "full" });
    assert.deepEqual(parseByteRange("bytes=0-10", 0), { kind: "unsatisfiable" });
});

test("a header with more than two numbers is ignored", () => {
    assert.deepEqual(parseByteRange("bytes=1-2-3", 1000), { kind: "full" });
    assert.deepEqual(parseByteRange("bytes=", 1000), { kind: "full" });
});

test("a number above the largest safe integer does not break the parse", () => {
    const huge = "99999999999999999999999";
    const whole = { kind: "range", start: 0, end: 999 };
    assert.deepEqual(parseByteRange(`bytes=0-${huge}`, 1000), whole);
    assert.deepEqual(parseByteRange(`bytes=-${huge}`, 1000), whole);
    assert.deepEqual(parseByteRange(`bytes=${huge}-`, 1000), { kind: "unsatisfiable" });
    assert.deepEqual(parseByteRange(`bytes=${huge}-1`, 1000), { kind: "full" });
});

test("the Content-Range answer names the piece and the whole", () => {
    assert.equal(contentRange({ start: 0, end: 99 }, 1000), "bytes 0-99/1000");
});
