/**
 * Familee - the files of the archive are streamed, not read whole
 *
 * A range request for a film used to read the whole file into memory before taking the slice. The
 * test writes a small file into a temporary MEDIA_ROOT and checks that the whole file and a byte
 * range arrive as streams, and that a key pointing outside the volume is refused.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import test from "node:test";

import { mediaFileSize, openMediaFile, writeMediaFile } from "@/lib/media-storage";

const TREE = "11111111-2222-3333-4444-555555555555";
const DIGEST = "a".repeat(64);
const KEY = `${TREE}/aa/aa/${DIGEST}-original.bin`;

async function readAll(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
}

test("a file is streamed whole, and a range starts where it is asked to", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "familee-media-"));
    const previous = process.env.MEDIA_ROOT;
    process.env.MEDIA_ROOT = root;
    try {
        await writeMediaFile(KEY, Buffer.from("0123456789"));

        assert.equal(await mediaFileSize(KEY), 10);

        const whole = openMediaFile(KEY);
        assert.ok(whole);
        assert.equal(await readAll(whole), "0123456789");

        const part = openMediaFile(KEY, { start: 2, end: 5 });
        assert.ok(part);
        assert.equal(await readAll(part), "2345");
    } finally {
        if (previous === undefined) delete process.env.MEDIA_ROOT;
        else process.env.MEDIA_ROOT = previous;
        await rm(root, { recursive: true, force: true });
    }
});

test("a key that is not a media key never reaches the volume", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "familee-media-empty-"));
    const previous = process.env.MEDIA_ROOT;
    process.env.MEDIA_ROOT = root;
    try {
        assert.equal(await mediaFileSize("../etc/passwd"), null);
        assert.equal(openMediaFile("../etc/passwd"), null);
        assert.equal(await mediaFileSize(`${TREE}/aa/aa/${DIGEST}-original.bin`), null);
    } finally {
        if (previous === undefined) delete process.env.MEDIA_ROOT;
        else process.env.MEDIA_ROOT = previous;
        await rm(root, { recursive: true, force: true });
    }
});
