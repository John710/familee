/**
 * Familee - the size of an upload, read before the body is
 *
 * A multipart body is read by `request.formData()`, which buffers all of it: the only way to keep a
 * request from filling the memory of the server is to refuse it before the body is touched. The
 * browser declares the size in Content-Length; that is what this module reads.
 *
 * A declared size is not a promise, but Node stops reading the body at Content-Length, so a client
 * that declares less cannot make the server buffer more. A request that declares nothing (chunked
 * encoding) is refused: there is nothing to measure it against.
 */

const MB = 1024 * 1024;

/** The file limit of one upload, and the same number in bytes. */
export function uploadLimit(): { limitMb: number; maxBytes: number } {
    const limitMb = Number(process.env.MEDIA_MAX_UPLOAD_MB) || 25;
    return { limitMb, maxBytes: limitMb * MB };
}

/** `missing` - no usable Content-Length; `tooLarge` - more than a form around one file can be. */
export type DeclaredUpload = "ok" | "missing" | "tooLarge";

/**
 * Checks the declared length of a multipart request. The body carries the file plus the bounda-
 * ries and the names of the fields, so a megabyte of slack is allowed above the file limit.
 */
export function declaredUpload(header: string | null, maxBytes: number): DeclaredUpload {
    const value = header?.trim() ?? "";
    if (!/^\d+$/.test(value)) return "missing";
    const declared = Number(value);
    if (!Number.isSafeInteger(declared) || declared > maxBytes + MB) return "tooLarge";
    return "ok";
}
