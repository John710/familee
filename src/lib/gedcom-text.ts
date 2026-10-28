/**
 * Familee - turning the bytes of a GEDCOM file into text
 *
 * GEDCOM 5.x files declare their character set in the header (1 CHAR): UNICODE,
 * ASCII, ANSI, ANSEL or UTF-8. GEDCOM 7.0 is always UTF-8 and has no CHAR line.
 * A byte-order mark (BOM) of UTF-16 settles the question before the header is read.
 *
 * What is decoded exactly:
 *   - UTF-8 (the default and GEDCOM 7.0), with or without a BOM;
 *   - UTF-16 (UNICODE), with a BOM in either byte order, the header's word, or - without
 *     either - recognised by the zero bytes every ASCII letter of the header carries;
 *   - ASCII, as Latin-1 (the bytes above 127 are kept as they are).
 *
 * What is an approximation, and is reported as a note (a key of gedcom.decode in the
 * translation files):
 *   - ANSI: the Windows code page of the author; Windows-1251 is taken, the usual
 *     one for Russian files; other code pages may show wrong letters;
 *   - ANSEL: the Latin accents are written as combining marks before the letter;
 *     they are read as Windows-1252, so some accents may come out wrong;
 *   - no CHAR line (or an unknown one) and bytes that are not valid UTF-8: an old
 *     Russian program wrote the file in its code page, so Windows-1251 is taken;
 *   - a file that says UTF-8 but holds bytes that are not: it is still read as UTF-8,
 *     the broken bytes become replacement characters.
 */

/** The largest file the import takes, before it is sent to the server as base64. */
export const GEDCOM_MAX_BYTES = 25 * 1024 * 1024;

/** Why the text should be checked; the keys of gedcom.decode in the translation files. */
export type DecodeNote = "ansi" | "ansel" | "noCharset" | "brokenUtf8";

export type Decoded = {
    text: string;
    /** The character set actually used to read the file. */
    encoding: string;
    /** A reason to check the result, shown as a warning; null when nothing is approximate. */
    note: DecodeNote | null;
};

/**
 * UTF-16 without a byte-order mark: the header is ASCII, so in UTF-16 every other byte of it is
 * zero - the odd ones in little-endian order, the even ones in big-endian. A UTF-8 or a single-byte
 * file has no zero bytes at all, so the test cannot mistake one for the other.
 */
function utf16WithoutBom(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
    const length = Math.min(bytes.length, 512) & ~1;
    if (length < 8) return null;
    let zeroEven = 0;
    let zeroOdd = 0;
    for (let i = 0; i < length; i += 2) {
        if (bytes[i] === 0) zeroEven += 1;
        if (bytes[i + 1] === 0) zeroOdd += 1;
    }
    const pairs = length / 2;
    if (zeroOdd > pairs * 0.7 && zeroEven < pairs * 0.1) return "utf-16le";
    if (zeroEven > pairs * 0.7 && zeroOdd < pairs * 0.1) return "utf-16be";
    return null;
}

/** The bytes as UTF-8, or null when they are not valid UTF-8. */
function strictUtf8(bytes: Uint8Array): string | null {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

export function decodeGedcomBytes(bytes: Uint8Array): Decoded {
    // A UTF-16 byte-order mark wins over anything the header may say.
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return {
            text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
            encoding: "UNICODE",
            note: null,
        };
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return {
            text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
            encoding: "UNICODE",
            note: null,
        };
    }
    const utf16 = utf16WithoutBom(bytes);
    if (utf16) {
        return { text: new TextDecoder(utf16).decode(bytes), encoding: "UNICODE", note: null };
    }

    // The header is read as Latin-1, which keeps every byte, to find the declared set.
    const probe = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    const declared = (/^[ \t]*1 CHAR[ \t]+(\S+)/m.exec(probe)?.[1] ?? "").toUpperCase();

    switch (declared) {
        case "UNICODE":
        case "UTF-16":
            return {
                text: new TextDecoder("utf-16le").decode(bytes),
                encoding: "UNICODE",
                note: null,
            };
        case "ASCII":
            return { text: new TextDecoder("latin1").decode(bytes), encoding: "ASCII", note: null };
        case "ANSI":
            return {
                text: new TextDecoder("windows-1251").decode(bytes),
                encoding: "ANSI",
                note: "ansi",
            };
        case "ANSEL":
            return {
                text: new TextDecoder("windows-1252").decode(bytes),
                encoding: "ANSEL",
                note: "ansel",
            };
        case "UTF-8":
        case "UTF8": {
            // The file says UTF-8: a few broken bytes do not make the rest of it Windows-1251.
            const strict = strictUtf8(bytes);
            if (strict !== null) return { text: strict, encoding: "UTF-8", note: null };
            return {
                text: new TextDecoder("utf-8").decode(bytes),
                encoding: "UTF-8",
                note: "brokenUtf8",
            };
        }
        default: {
            // No CHAR line (GEDCOM 7.0, or an old program that left it out) or a word this
            // reader does not know: UTF-8 when the bytes are UTF-8, otherwise the code page of
            // the Russian programs the family files come from.
            const strict = strictUtf8(bytes);
            if (strict !== null) return { text: strict, encoding: "UTF-8", note: null };
            return {
                text: new TextDecoder("windows-1251").decode(bytes),
                encoding: "ANSI",
                note: "noCharset",
            };
        }
    }
}
