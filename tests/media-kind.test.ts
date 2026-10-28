/**
 * Familee - what a dropped file is
 *
 * The kind decides everything that follows: a photograph goes through the picture pipeline, a
 * document or a film is kept as it came. The archive never trusts the type a browser declares, so
 * the table and the fallback have to be checked here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { capFilename, classifyMedia, extensionOf, inlineable } from "@/lib/media-kind";

test("reads the extension of a file name, and gives up on a missing one", () => {
    assert.equal(extensionOf("Scan.PDF"), "pdf");
    assert.equal(extensionOf("a.b.c.mp4"), "mp4");
    assert.equal(extensionOf("photo"), null);
    assert.equal(extensionOf("name."), null);
    assert.equal(extensionOf("weird.thisislong"), null);
    assert.equal(extensionOf(null), null);
});

test("a photograph is the three formats the pipeline reads", () => {
    assert.equal(classifyMedia("image/jpeg", "a.jpg").kind, "photo");
    assert.equal(classifyMedia("image/png", "a.png").kind, "photo");
    assert.equal(classifyMedia("image/webp", "a.webp").kind, "photo");
    assert.equal(classifyMedia(null, "a.JPEG").processable, true);
});

test("a picture the pipeline cannot read is a document, not a refusal", () => {
    assert.equal(classifyMedia("image/gif", "a.gif").kind, "document");
    assert.equal(classifyMedia("image/svg+xml", "logo.svg").kind, "document");
    assert.equal(classifyMedia("image/tiff", "a.tif").processable, false);
});

test("documents, sound and film are told apart", () => {
    assert.equal(classifyMedia("application/pdf", "certificate.pdf").kind, "document");
    assert.equal(classifyMedia(null, "interview.mp3").kind, "audio");
    assert.equal(classifyMedia(null, "wedding.mp4").kind, "video");
    assert.equal(classifyMedia(null, "notes.txt").kind, "document");
    assert.equal(classifyMedia(null, "backup.zip").kind, "other");
});

test("the extension leads: a PDF named .bin is still a document", () => {
    const media = classifyMedia("application/octet-stream", "scan.PDF");
    assert.equal(media.kind, "document");
    assert.equal(media.mimeType, "application/pdf");
    assert.equal(media.extension, "pdf");
});

test("a declared type that disagrees with the name does not win", () => {
    // A GIF renamed to .jpg is not a photograph and is not served as one either.
    const media = classifyMedia("text/html", "notreally.jpg");
    assert.equal(media.kind, "photo");
    assert.equal(media.mimeType, "image/jpeg");
});

test("an unknown file is kept, and served as bytes to download", () => {
    const media = classifyMedia("application/octet-stream", "mystery.bin");
    assert.equal(media.kind, "other");
    assert.equal(media.mimeType, "application/octet-stream");
    assert.equal(media.extension, "bin");
    assert.equal(inlineable(media.mimeType), false);
});

test("a declared type is kept for an unknown extension only when it is safe", () => {
    // Sound, film and plain documents keep the flavour the browser named.
    assert.equal(classifyMedia("audio/x-custom", "memo.xyz").mimeType, "audio/x-custom");
    assert.equal(classifyMedia("video/3gpp", "clip.3gp").mimeType, "video/3gpp");
    assert.equal(classifyMedia("text/plain; charset=utf-8", "notes.log").mimeType, "text/plain");
    assert.equal(classifyMedia("text/csv", "table.dat").mimeType, "text/csv");
    assert.equal(classifyMedia("application/pdf", "scan.xyz").mimeType, "application/pdf");
});

test("a declared type that can run a script is served as bytes", () => {
    // <script src=".../original"> would run these on the archive's own origin.
    for (const declared of [
        "text/javascript",
        "application/javascript",
        "text/html",
        "application/xhtml+xml",
        "text/css",
        "text/xml",
        "image/svg+xml",
    ]) {
        const media = classifyMedia(declared, "upload.xyz");
        assert.equal(media.mimeType, "application/octet-stream", declared);
        assert.equal(inlineable(media.mimeType), false, declared);
    }
});

test("a long file name is cut but keeps its extension", () => {
    assert.equal(capFilename("scan.pdf"), "scan.pdf");
    assert.equal(capFilename(null), null);
    assert.equal(capFilename(""), null);

    const long = `${"a".repeat(400)}.JPEG`;
    const cut = capFilename(long);
    assert.equal(cut?.length, 255);
    assert.ok(cut?.endsWith(".JPEG"));

    // No extension: the head alone is cut.
    assert.equal(capFilename("b".repeat(300))?.length, 255);
    // A cut that would split a surrogate pair drops the half character.
    const emoji = capFilename("😀".repeat(10), 5);
    assert.equal(emoji, "😀😀");
});

test("only what a browser can show inline is marked so", () => {
    assert.equal(inlineable("image/jpeg"), true);
    assert.equal(inlineable("application/pdf"), true);
    assert.equal(inlineable("audio/mpeg"), true);
    assert.equal(inlineable("video/mp4"), true);
    assert.equal(inlineable("text/plain"), true);
    assert.equal(inlineable("application/zip"), false);
});

test("a file that could carry a script is downloaded, not opened in the page", () => {
    // An SVG or an HTML page served from the archive's own address would run beside its pages.
    assert.equal(inlineable("image/svg+xml"), false);
    assert.equal(inlineable("text/html"), false);
    assert.equal(inlineable("application/xhtml+xml"), false);
    assert.equal(inlineable("text/html; charset=utf-8"), false);
});
