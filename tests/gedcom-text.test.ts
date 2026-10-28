/**
 * Familee - reading the bytes of a GEDCOM file
 *
 * The family files come from old Russian programs as often as from new ones: UTF-16 without a
 * byte-order mark, Windows-1251 without a CHAR line. Each of them must come out as the same text,
 * and the guess must be said (a note) whenever it is a guess.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { decodeGedcomBytes } from "@/lib/gedcom-text";

const TEXT = "0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Иван /Петров/\n0 TRLR\n";

/** The text as UTF-16 code units in the given byte order, without a byte-order mark. */
function utf16(text: string, littleEndian: boolean): Uint8Array {
    const bytes = new Uint8Array(text.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < text.length; i += 1) {
        view.setUint16(i * 2, text.charCodeAt(i), littleEndian);
    }
    return bytes;
}

/** The text in Windows-1251: ASCII as it is, the Cyrillic letters А..я at 0xC0..0xFF. */
function windows1251(text: string): Uint8Array {
    return Uint8Array.from([...text], (char) => {
        const code = char.charCodeAt(0);
        if (code < 0x80) return code;
        if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
        throw new Error(`no Windows-1251 byte for ${char}`);
    });
}

test("reads UTF-16 without a byte-order mark in either order", () => {
    for (const littleEndian of [true, false]) {
        const decoded = decodeGedcomBytes(utf16(TEXT, littleEndian));
        assert.equal(decoded.text, TEXT);
        assert.equal(decoded.encoding, "UNICODE");
        assert.equal(decoded.note, null);
    }
});

test("reads UTF-8 without a CHAR line as UTF-8", () => {
    const decoded = decodeGedcomBytes(new TextEncoder().encode(TEXT));
    assert.equal(decoded.text, TEXT);
    assert.equal(decoded.note, null);
});

test("falls back to Windows-1251 when there is no CHAR line and the bytes are not UTF-8", () => {
    const decoded = decodeGedcomBytes(windows1251(TEXT));
    assert.equal(decoded.text, TEXT);
    assert.equal(decoded.encoding, "ANSI");
    assert.equal(decoded.note, "noCharset");
});

test("a file that says UTF-8 stays UTF-8 even with a broken byte, and says so", () => {
    const head = new TextEncoder().encode("0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME A");
    const bytes = new Uint8Array([...head, 0xff, 0x0a]);
    const decoded = decodeGedcomBytes(bytes);
    assert.equal(decoded.encoding, "UTF-8");
    assert.equal(decoded.note, "brokenUtf8");
});
