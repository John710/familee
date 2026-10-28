/**
 * Familee - the bytes a browser asks for with a Range header
 *
 * Sound and film are not downloaded whole before they play: a player asks for the start of a file,
 * then for the piece it needs next, and dragging the bar asks for a jump. That is one Range header
 * (RFC 9110, "Range: bytes=..."), and this module reads it. Only a single range is honoured; a
 * request for several is answered with the whole file, which every player accepts.
 *
 * Pure: no request, no response, no filesystem. See tests/http-range.test.ts.
 */

/** A closed range of bytes: both ends are part of the answer. */
export type ByteRange = { start: number; end: number };

export type RangeResult =
    /** No Range header, or one this archive does not split: answer with the whole file. */
    | { kind: "full" }
    /** A usable range. */
    | { kind: "range"; start: number; end: number }
    /** The range lies beyond the file: answer 416, as the standard asks. */
    | { kind: "unsatisfiable" };

/**
 * Reads a Range header against a file of `size` bytes. Anything malformed is answered with the
 * whole file rather than an error: a broken header must not stop a download.
 */
export function parseByteRange(header: string | null, size: number): RangeResult {
    if (!header) return { kind: "full" };
    if (size <= 0) return { kind: "unsatisfiable" };

    const match = /^bytes=(.+)$/i.exec(header.trim());
    if (!match) return { kind: "full" };

    const spec = match[1]?.trim() ?? "";
    // Several ranges are not joined here; the whole file is a valid answer and one round trip.
    if (spec.includes(",")) return { kind: "full" };

    const parts = /^(\d*)-(\d*)$/.exec(spec);
    const startText = parts?.[1] ?? "";
    const endText = parts?.[2] ?? "";
    if (!parts || (startText === "" && endText === "")) return { kind: "full" };

    if (startText === "") {
        // A suffix: the last N bytes.
        const suffix = number(endText);
        if (suffix <= 0) return { kind: "unsatisfiable" };
        return { kind: "range", start: Math.max(0, size - suffix), end: size - 1 };
    }

    const start = number(startText);
    // A range whose end is before its start is not valid syntax (RFC 9110, 14.1.2) and is ignored
    // like any other broken header, not refused.
    if (endText !== "" && number(endText) < start) return { kind: "full" };
    if (start >= size) return { kind: "unsatisfiable" };

    if (endText === "") return { kind: "range", start, end: size - 1 };
    return { kind: "range", start, end: Math.min(number(endText), size - 1) };
}

/** The digits as a number, held at the largest integer JavaScript counts exactly. */
function number(digits: string): number {
    return Math.min(Number(digits), Number.MAX_SAFE_INTEGER);
}

/** The Content-Range answer for a range: "bytes start-end/size". */
export function contentRange(range: ByteRange, size: number): string {
    return `bytes ${range.start}-${range.end}/${size}`;
}
