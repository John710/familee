/**
 * Familee - the date of a photograph as a camera writes it
 *
 * The files are built here byte by byte, because the point of the reader is what it does with a
 * broken one: an offset that points outside the block, a camera that wrote a date of zero, a file
 * that carries no Exif at all. Every case ends in either a moment or null, never in an exception.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { exifDateFrom, exifDay } from "@/lib/exif-date";

type Dates = {
    /** The DateTimeOriginal tag of the Exif directory: what the camera recorded. */
    original?: string;
    /** The DateTimeDigitized tag: the moment a scan or a copy was made. */
    digitized?: string;
    /** The DateTime tag of the first directory: what an editor may have written. */
    modified?: string;
    /** Write the Exif directory even when it holds no date, for the broken-file cases. */
    emptyExifDirectory?: boolean;
};

/** A TIFF block with the directories the caller asked for. */
function tiffBlock(little: boolean, dates: Dates): Buffer {
    const u16 = (value: number) => {
        const bytes = Buffer.alloc(2);
        if (little) bytes.writeUInt16LE(value);
        else bytes.writeUInt16BE(value);
        return bytes;
    };
    const u32 = (value: number) => {
        const bytes = Buffer.alloc(4);
        if (little) bytes.writeUInt32LE(value);
        else bytes.writeUInt32BE(value);
        return bytes;
    };

    const exifDirectory =
        (dates.original !== undefined || dates.digitized !== undefined ? 1 : 0) +
        (dates.emptyExifDirectory ? 1 : 0);
    const exifTags = exifDirectory > 0 ? 1 : 0;
    const ifd0Tags = (dates.modified === undefined ? 0 : 1) + (exifTags > 0 ? 1 : 0);

    const ifd0Size = 2 + ifd0Tags * 12 + 4;
    const exifOffset = 8 + ifd0Size;
    const exifSize = 2 + exifTags * 12 + 4;
    const stringsAt = exifOffset + exifSize;

    const strings: Buffer[] = [];
    let cursor = stringsAt;

    /** One entry of a directory: inline when it is four bytes or fewer, by offset when longer. */
    const entry = (tag: number, value: { text: string } | { long: number }) => {
        if ("long" in value) return Buffer.concat([u16(tag), u16(4), u32(1), u32(value.long)]);
        const raw = Buffer.from(`${value.text}\0`, "latin1");
        const at = cursor;
        cursor += raw.length;
        strings.push(raw);
        const count = u32(raw.length);
        if (raw.length > 4) return Buffer.concat([u16(tag), u16(2), count, u32(at)]);
        return Buffer.concat([u16(tag), u16(2), count, raw, Buffer.alloc(4 - raw.length)]);
    };

    const ifd0Entries: Buffer[] = [];
    if (dates.modified !== undefined) ifd0Entries.push(entry(0x0132, { text: dates.modified }));
    if (exifTags > 0) ifd0Entries.push(entry(0x8769, { long: exifOffset }));

    const exifEntries: Buffer[] = [];
    if (dates.original !== undefined) exifEntries.push(entry(0x9003, { text: dates.original }));
    if (dates.digitized !== undefined) exifEntries.push(entry(0x9004, { text: dates.digitized }));

    return Buffer.concat([
        Buffer.from(little ? "II" : "MM", "latin1"),
        u16(42),
        u32(8),
        u16(ifd0Entries.length),
        ...ifd0Entries,
        u32(0),
        u16(exifEntries.length),
        ...exifEntries,
        u32(0),
        ...strings,
    ]);
}

/** The day the file carries, or null: every case reads the block through this one funnel. */
function dayOf(file: Buffer): string | null {
    const date = exifDateFrom(file);
    return date === null ? null : exifDay(date);
}

/** A JPEG that carries the block, or one that carries no metadata at all. */
function jpegWithExif(tiff: Buffer | null): Buffer {
    const parts = [Buffer.from([0xff, 0xd8])];
    if (tiff) {
        const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
        const length = Buffer.alloc(2);
        length.writeUInt16BE(payload.length + 2);
        parts.push(Buffer.from([0xff, 0xe1]), length, payload);
    }
    parts.push(Buffer.from([0xff, 0xd9]));
    return Buffer.concat(parts);
}

test("reads the moment the camera recorded", () => {
    const file = jpegWithExif(tiffBlock(true, { original: "2007:04:21 18:35:02" }));
    assert.deepEqual(exifDateFrom(file), {
        year: 2007,
        month: 4,
        day: 21,
        hour: 18,
        minute: 35,
        second: 2,
    });
});

test("reads a big-endian file", () => {
    const file = jpegWithExif(tiffBlock(false, { original: "1961:04:12 09:07:00" }));
    assert.equal(dayOf(file), "1961-04-12");
});

test("falls back to the digitized tag, then to the date of the file", () => {
    const digitized = jpegWithExif(tiffBlock(true, { digitized: "1998:11:02 12:00:00" }));
    assert.equal(dayOf(digitized), "1998-11-02");

    const modified = jpegWithExif(tiffBlock(true, { modified: "2015:06:30 00:00:00" }));
    assert.equal(dayOf(modified), "2015-06-30");
});

test("skips a date of zero and takes the next one", () => {
    const file = jpegWithExif(
        tiffBlock(true, { original: "0000:00:00 00:00:00", modified: "2015:06:30 00:00:00" }),
    );
    assert.equal(dayOf(file), "2015-06-30");
});

test("says nothing when nothing is written", () => {
    assert.equal(exifDateFrom(jpegWithExif(null)), null);
    assert.equal(exifDateFrom(jpegWithExif(tiffBlock(true, {}))), null);
    assert.equal(
        exifDateFrom(jpegWithExif(tiffBlock(true, { original: "0000:00:00 00:00:00" }))),
        null,
    );
});

test("survives a broken file", () => {
    // Not a JPEG at all, a JPEG cut in the middle, and a block with a broken byte order mark.
    assert.equal(exifDateFrom(Buffer.from("not a picture", "latin1")), null);
    assert.equal(exifDateFrom(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20])), null);
    const broken = jpegWithExif(tiffBlock(true, { original: "2007:04:21 18:35:02" }));
    broken.write("XX", 12, "latin1");
    assert.equal(exifDateFrom(broken), null);
});

test("rejects a moment no camera could have meant", () => {
    const file = jpegWithExif(tiffBlock(true, { original: "2007:13:45 25:61:61" }));
    assert.equal(exifDateFrom(file), null);
});

test("rejects a day the calendar does not have", () => {
    // The database refuses these for media.taken_start, so they must never reach the insert.
    for (const original of ["2007:02:30 10:00:00", "2023:02:29 10:00:00", "2007:04:31 10:00:00"]) {
        assert.equal(exifDateFrom(jpegWithExif(tiffBlock(true, { original }))), null, original);
    }
    // Feb 29 of a leap year is a real day.
    const leap = jpegWithExif(tiffBlock(true, { original: "2024:02:29 10:00:00" }));
    assert.equal(dayOf(leap), "2024-02-29");
    // An impossible original date falls through to the next tag that is a real day.
    const fallback = jpegWithExif(
        tiffBlock(true, { original: "2007:02:30 10:00:00", modified: "2015:06:30 00:00:00" }),
    );
    assert.equal(dayOf(fallback), "2015-06-30");
});

test("steps over a fill byte before the Exif segment", () => {
    const plain = jpegWithExif(tiffBlock(true, { original: "2007:04:21 18:35:02" }));
    // "FF D8 FF E1 ..." becomes "FF D8 FF FF E1 ...": the fill byte is one byte, not two.
    const filled = Buffer.concat([plain.subarray(0, 2), Buffer.from([0xff]), plain.subarray(2)]);
    assert.equal(dayOf(filled), "2007-04-21");
});

test("writes the day as the database wants it", () => {
    assert.equal(
        exifDay({ year: 907, month: 1, day: 2, hour: 3, minute: 4, second: 5 }),
        "0907-01-02",
    );
});
