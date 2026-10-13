/**
 * Familee - turning the bytes of a GEDCOM file into text
 *
 * GEDCOM 5.x files declare their character set in the header (1 CHAR): UNICODE,
 * ASCII, ANSI, ANSEL or UTF-8. GEDCOM 7.0 is always UTF-8 and has no CHAR line.
 * A byte-order mark (BOM) of UTF-16 settles the question before the header is read.
 *
 * What is decoded exactly:
 *   - UTF-8 (the default and GEDCOM 7.0), with or without a BOM;
 *   - UTF-16 (UNICODE), with a BOM in either byte order, or the header's word;
 *   - ASCII, as Latin-1 (the bytes above 127 are kept as they are).
 *
 * What is an approximation, and is reported as a note:
 *   - ANSI: the Windows code page of the author; Windows-1251 is taken, the usual
 *     one for Russian files; other code pages may show wrong letters;
 *   - ANSEL: the Latin accents are written as combining marks before the letter;
 *     they are read as Windows-1252, so some accents may come out wrong.
 */

export type Decoded = {
    text: string;
    /** The character set actually used to read the file. */
    encoding: string;
    /** A reason to check the result, shown as a warning; null when nothing is approximate. */
    note: string | null;
};

export function decodeGedcomBytes(bytes: Uint8Array): Decoded {
    // A UTF-16 byte-order mark wins over anything the header may say.
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UNICODE", note: null };
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "UNICODE", note: null };
    }

    // The header is read as Latin-1, which keeps every byte, to find the declared set.
    const probe = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    const declared = (/^1 CHAR[ \t]+(\S+)/m.exec(probe)?.[1] ?? "UTF-8").toUpperCase();

    switch (declared) {
        case "UNICODE":
        case "UTF-16":
            return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "UNICODE", note: null };
        case "ASCII":
            return { text: new TextDecoder("latin1").decode(bytes), encoding: "ASCII", note: null };
        case "ANSI":
            return {
                text: new TextDecoder("windows-1251").decode(bytes),
                encoding: "ANSI",
                note: "the file says ANSI: read as Windows-1251; check the names",
            };
        case "ANSEL":
            return {
                text: new TextDecoder("windows-1252").decode(bytes),
                encoding: "ANSEL",
                note: "the file says ANSEL: accents may come out wrong",
            };
        default:
            return { text: new TextDecoder("utf-8").decode(bytes), encoding: "UTF-8", note: null };
    }
}
