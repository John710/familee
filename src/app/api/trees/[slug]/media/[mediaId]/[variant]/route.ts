/**
 * Familee - showing a photograph
 *
 * The files are not public: the route gives a photograph to the members of the tree it
 * belongs to, and to nobody else. Anybody else gets the same 404 as for a tree that does
 * not exist. The browser may keep the picture for an hour, privately.
 */

import { type MediaVariantName, readMediaFile } from "@/lib/media-storage";
import { findVariantKey } from "@/lib/photos";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

const VARIANTS: readonly MediaVariantName[] = ["thumb", "medium", "original"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string; mediaId: string; variant: string }> },
) {
    const { slug, mediaId, variant } = await params;

    const user = await getCurrentUser();
    if (!user) return new Response("Sign in first", { status: 401 });

    const access = await getTreeAccess(slug, user.id);
    if (!access) return new Response("Not found", { status: 404 });

    // Both parts come from the address: they are checked before they reach the database.
    if (!(VARIANTS as readonly string[]).includes(variant) || !UUID.test(mediaId)) {
        return new Response("Not found", { status: 404 });
    }

    const key = await findVariantKey(access.treeId, mediaId, variant as MediaVariantName);
    if (!key) return new Response("Not found", { status: 404 });

    try {
        const data = await readMediaFile(key);
        return new Response(new Uint8Array(data), {
            headers: {
                "Content-Type": "image/webp",
                "Cache-Control": "private, max-age=3600",
            },
        });
    } catch {
        return new Response("Not found", { status: 404 });
    }
}
