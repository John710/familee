/**
 * Familee - adding a photograph to a person's album
 *
 * POST with a multipart form field "file". Only an editor or higher in the tree may add
 * photographs; anybody else gets the same 404 as for a tree that does not exist, or a 403
 * when they are a member without the right to write. The answer is JSON with an error key
 * from the translations, so the page can show the message in the right language.
 */

import { addPersonPhoto, type PhotoError } from "@/lib/photos";
import { atLeast } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

const MB = 1024 * 1024;

const STATUS: Record<PhotoError, number> = {
    "media.errors.unsupported": 415,
    "media.errors.failed": 422,
    "media.errors.duplicate": 409,
    "members.notMember": 403,
    "person.notFound": 404,
};

function reply(status: number, error: string, extra: Record<string, unknown> = {}): Response {
    return Response.json({ ok: false, error, ...extra }, { status });
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ slug: string; personId: string }> },
) {
    const { slug, personId } = await params;

    const user = await getCurrentUser();
    if (!user) return reply(401, "auth.needSignIn");

    const access = await getTreeAccess(slug, user.id);
    if (!access) return reply(404, "auth.noPermission");
    if (!atLeast(access.role, "editor")) return reply(403, "auth.noPermission");

    const limitMb = Number(process.env.MEDIA_MAX_UPLOAD_MB) || 25;
    const maxBytes = limitMb * MB;

    // The body is refused before it is read when the browser declares it too large.
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > maxBytes + MB) return reply(413, "media.errors.tooLarge", { limit: limitMb });

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return reply(400, "media.errors.failed");
    }

    const file = form.get("file");
    if (!(file instanceof File)) return reply(400, "media.errors.failed");
    if (file.size > maxBytes) return reply(413, "media.errors.tooLarge", { limit: limitMb });

    const result = await addPersonPhoto({
        treeId: access.treeId,
        personId,
        userId: user.id,
        source: Buffer.from(await file.arrayBuffer()),
        originalFilename: file.name || null,
    });

    if (!result.ok) return reply(STATUS[result.error], result.error);
    return Response.json({ ok: true, mediaId: result.mediaId });
}
