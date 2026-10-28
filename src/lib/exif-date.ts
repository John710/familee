/**
 * Familee - the moment a photograph was taken, read from the file itself
 *
 * A camera writes the moment into the Exif block of the JPEG: the DateTimeOriginal tag of the Exif
 * directory, or the DateTime tag of the first directory when an editor rewrote the file. That block
 * is a small TIFF structure - a byte-order mark, the offset of the first directory, twelve bytes per
 * entry - so three tags are read here rather than pulling in a parser for them.
 *
 * Pure: bytes in, a date or null out, and never an exception. Anything odd in the file - no Exif at
 * all, a broken offset, or the all-zero date a camera writes when it did not know the time - gives
 * null, and the upload carries on without a date.
 */

import { isDay } from "@/lib/day";

/** The moment of the shutter, as the camera wrote it. */
export type ExifDate = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
};

/** The start of a scan or of the image itself: no metadata follows. */
const SOS = 0xda;
const EOI = 0xd9;
const APP1 = 0xe1;

/** Where the three date tags live. */
const EXIF_DIRECTORY = 0x8769;
const DATE_TIME = 0x0132;
const DATE_TIME_ORIGINAL = 0x9003;
const DATE_TIME_DIGITIZED = 0x9004;

/** The type of the date tags: an ASCII string. */
const ASCII = 2;

/** The type of an offset: a single long. */
const LONG = 4;

/** Photography began in 1826; a camera of the future is a broken file. */
const FIRST_YEAR = 1826;
const LAST_YEAR = 2200;

/** The awkward format of the tags: "2007:04:21 18:35:02". */
const PATTERN = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/**
 * The moment the photograph was taken, or null when the file does not say. The original tag wins
 * over the digitized one, and both over the date an editor may have written into the first
 * directory.
 */
export function exifDateFrom(buffer: Buffer): ExifDate | null {
    const block = exifBlock(buffer);
    if (!block) return null;

    const reader = tiffReader(block);
    if (!reader) return null;

    const exif = reader.pointer(reader.ifd0, EXIF_DIRECTORY);
    const written = [
        exif === null ? null : reader.text(exif, DATE_TIME_ORIGINAL),
        exif === null ? null : reader.text(exif, DATE_TIME_DIGITIZED),
        reader.text(reader.ifd0, DATE_TIME),
    ];
    for (const text of written) {
        const date = text === null ? null : parseTag(text);
        if (date) return date;
    }
    return null;
}

/** The date of the moment as the column `media.taken_start` wants it: "2007-04-21". */
export function exifDay(date: ExifDate): string {
    const pad = (value: number, width: number) => `${value}`.padStart(width, "0");
    return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

/** The Exif block of a JPEG: the payload of its APP1 segment, past the "Exif" signature. */
function exifBlock(buffer: Buffer): Buffer | null {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

    let offset = 2;
    while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) return null;
        const marker = buffer[offset + 1];
        if (marker === undefined) return null;

        // The end of the metadata, or a marker that carries no payload.
        if (marker === SOS || marker === EOI) return null;
        // 0xFF is a fill byte: the next 0xFF may already be the start of the real marker, so only
        // one byte is skipped (two would lose the marker in "FF FF E1").
        if (marker === 0xff) {
            offset += 1;
            continue;
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }

        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2 || offset + 2 + length > buffer.length) return null;

        if (marker === APP1) {
            const payload = buffer.subarray(offset + 4, offset + 2 + length);
            if (payload.length > 6 && payload.subarray(0, 6).toString("latin1") === "Exif\0\0") {
                return payload.subarray(6);
            }
        }
        offset += 2 + length;
    }
    return null;
}

/**
 * A reader over the TIFF block. Every read is checked: a file whose offsets point outside the block
 * gives null instead of a range error.
 */
function tiffReader(data: Buffer): {
    ifd0: number;
    text: (directory: number, tag: number) => string | null;
    pointer: (directory: number, tag: number) => number | null;
} | null {
    if (data.length < 8) return null;

    // "II" is little-endian, "MM" big-endian.
    const order = data.subarray(0, 2).toString("latin1");
    if (order !== "II" && order !== "MM") return null;
    const little = order === "II";

    const u16 = (at: number): number | null =>
        at >= 0 && at + 2 <= data.length
            ? little
                ? data.readUInt16LE(at)
                : data.readUInt16BE(at)
            : null;
    const u32 = (at: number): number | null =>
        at >= 0 && at + 4 <= data.length
            ? little
                ? data.readUInt32LE(at)
                : data.readUInt32BE(at)
            : null;

    if (u16(2) !== 42) return null;
    const ifd0 = u32(4);
    if (ifd0 === null || ifd0 + 2 > data.length) return null;

    /** The entries of one directory, as (tag, type, count, value at) triples. */
    const entries = (
        directory: number,
    ): { tag: number; type: number; length: number; at: number }[] => {
        const count = u16(directory);
        // A directory with no entries, or one that claims more than a file of this size can hold.
        if (count === null || count === 0 || count > 512) return [];
        const found: { tag: number; type: number; length: number; at: number }[] = [];
        for (let index = 0; index < count; index += 1) {
            const entry = directory + 2 + index * 12;
            if (entry + 12 > data.length) return found;
            const tag = u16(entry);
            const type = u16(entry + 2);
            const length = u32(entry + 4);
            if (tag === null || type === null || length === null) return found;
            // A value of four bytes or fewer sits in the entry itself.
            const at = length <= 4 ? entry + 8 : (u32(entry + 8) ?? -1);
            found.push({ tag, type, length, at });
        }
        return found;
    };

    return {
        ifd0,
        text: (directory, tag) => {
            for (const entry of entries(directory)) {
                if (entry.tag !== tag || entry.type !== ASCII) continue;
                if (entry.at < 0 || entry.at + entry.length > data.length) return null;
                return data
                    .subarray(entry.at, entry.at + entry.length)
                    .toString("latin1")
                    .replace(/\0+$/, "");
            }
            return null;
        },
        pointer: (directory, tag) => {
            for (const entry of entries(directory)) {
                if (entry.tag !== tag) continue;
                // The offset of a sub-directory is a single LONG, so it sits in the entry itself.
                if (entry.type !== LONG || entry.length > 4) return null;
                return u32(entry.at) ?? null;
            }
            return null;
        },
    };
}

/** "2007:04:21 18:35:02" as a moment, when it is a moment a camera could have meant. */
function parseTag(text: string): ExifDate | null {
    const match = PATTERN.exec(text.trim());
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    const date: ExifDate = {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
    };
    if (date.year < FIRST_YEAR || date.year > LAST_YEAR) return null;
    if (date.month < 1 || date.month > 12) return null;
    // The real calendar day: the database refuses "2007-02-30" and the whole upload would fail.
    if (!isDay(exifDay(date))) return null;
    if (date.hour > 23 || date.minute > 59 || date.second > 60) return null;
    return date;
}
