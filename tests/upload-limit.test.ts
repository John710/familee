/**
 * Familee - the size of an upload is checked before the body is read
 *
 * A multipart request is buffered by the runtime, so a request without a declared size has no
 * bound at all. The helper decides from Content-Length alone: a usable declaration within the
 * limit, one that is too large, or none at all.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { declaredUpload, uploadLimit } from "@/lib/upload-limit";

const MB = 1024 * 1024;

test("the limit comes from MEDIA_MAX_UPLOAD_MB, and has a default", () => {
    const previous = process.env.MEDIA_MAX_UPLOAD_MB;
    try {
        delete process.env.MEDIA_MAX_UPLOAD_MB;
        assert.deepEqual(uploadLimit(), { limitMb: 25, maxBytes: 25 * MB });

        process.env.MEDIA_MAX_UPLOAD_MB = "5";
        assert.deepEqual(uploadLimit(), { limitMb: 5, maxBytes: 5 * MB });

        process.env.MEDIA_MAX_UPLOAD_MB = "not a number";
        assert.deepEqual(uploadLimit(), { limitMb: 25, maxBytes: 25 * MB });
    } finally {
        if (previous === undefined) delete process.env.MEDIA_MAX_UPLOAD_MB;
        else process.env.MEDIA_MAX_UPLOAD_MB = previous;
    }
});

test("a request without a declared size is not read", () => {
    for (const header of [null, "", "  ", "abc", "-1", "1e9", "12.5"]) {
        assert.equal(declaredUpload(header, 25 * MB), "missing", String(header));
    }
});

test("a declared size above the limit is refused, and the form's own bytes have slack", () => {
    const maxBytes = 25 * MB;
    assert.equal(declaredUpload(String(maxBytes), maxBytes), "ok");
    assert.equal(declaredUpload(String(maxBytes + MB), maxBytes), "ok");
    assert.equal(declaredUpload(String(maxBytes + MB + 1), maxBytes), "tooLarge");
    assert.equal(declaredUpload(String(maxBytes * 40), maxBytes), "tooLarge");
});
