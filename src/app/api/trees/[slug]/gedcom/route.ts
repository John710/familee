/**
 * Familee - downloading a tree as a GEDCOM 7.0 file
 *
 * Only a member of the tree gets the file; anybody else gets the same 404 as for a
 * tree that does not exist. The file is UTF-8 with the header GEDC / VERS 7.0.
 */

import { loadTreeForExport } from "@/lib/gedcom-data";
import { writeGedcom7 } from "@/lib/gedcom-export";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    const user = await getCurrentUser();
    if (!user) {
        return new Response("Sign in first", { status: 401 });
    }

    const access = await getTreeAccess(slug, user.id);
    if (!access) {
        return new Response("Not found", { status: 404 });
    }

    const { persons, unions } = await loadTreeForExport(access.treeId);
    const text = writeGedcom7({
        persons,
        unions,
        sourceName: "Familee",
        sourceVersion: "0.1.0",
    });

    return new Response(text, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}.ged"`,
        },
    });
}
