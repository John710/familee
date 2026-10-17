"use server";

/**
 * Familee - the search behind the window that opens on Ctrl+K
 *
 * One entry point for both cases: inside a tree the whole archive of that tree is searched (the same
 * search the search page runs), and outside one the people and the trees of the reader. The pages
 * the reader may open come along, already filtered by their role in the tree.
 */

import { type SearchHit, searchAcrossTrees, searchHitHref, searchTree } from "@/lib/library";
import { commandHref, commandsFor, type PaletteCommandKey } from "@/lib/palette";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type PaletteHit = {
    kind: SearchHit["kind"] | "tree";
    id: string;
    personId: string | null;
    title: string;
    detail: string;
    href: string;
    /** The tree a hit of another tree came from, for the second line. */
    treeTitle: string | null;
};

export type PaletteResult =
    | {
          ok: true;
          /** The title of the tree the window is open in, or null outside a tree. */
          treeTitle: string | null;
          commands: { key: PaletteCommandKey; href: string }[];
          hits: PaletteHit[];
      }
    | { ok: false; error: string };

export async function searchPaletteAction(input: {
    slug: string | null;
    query: string;
}): Promise<PaletteResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const slug = input.slug;
    if (slug) {
        const access = await getTreeAccess(slug, user.id);
        if (!access) return { ok: false, error: "common.notFound" };

        const found = await searchTree(access.treeId, input.query);
        return {
            ok: true,
            treeTitle: access.title,
            commands: commandsFor(access.role).map((command) => ({
                key: command.key,
                href: commandHref(slug, command),
            })),
            hits: found.map((hit) => ({
                ...hit,
                href: searchHitHref(slug, hit),
                treeTitle: null,
            })),
        };
    }

    const found = await searchAcrossTrees(user.id, input.query);
    return {
        ok: true,
        treeTitle: null,
        commands: [],
        hits: found.map((hit) => {
            const asHit: SearchHit = {
                kind: "person",
                id: hit.id,
                personId: hit.personId,
                title: hit.title,
                detail: hit.detail,
            };
            return {
                kind: hit.kind,
                id: hit.id,
                personId: hit.personId,
                title: hit.title,
                detail: hit.detail,
                href:
                    hit.kind === "tree"
                        ? `/trees/${hit.slug}/members`
                        : searchHitHref(hit.slug, asHit),
                treeTitle: hit.treeTitle,
            };
        }),
    };
}
