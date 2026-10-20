/**
 * Familee - what a dropped file is
 *
 * The kind decides everything that follows: a photograph goes through the picture pipeline, a
 * document or a film is kept as it came. The archive never trusts the type a browser declares, so
 * the table and the fallback have to be checked here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { classifyMedia, extensionOf, inlineable } from "@/lib/media-kind";

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
