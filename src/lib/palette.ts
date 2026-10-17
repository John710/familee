/**
 * Familee - the pages a tree offers and the moving of the selection in the palette
 *
 * The window that opens on Ctrl+K lists the pages of the tree and, as the reader types, what the
 * search of the tree finds. The list of pages lives here with the least role that may open each one:
 * the pages themselves refuse a reader below that role, so the window must not offer them either.
 *
 * Pure functions, no React and no database: the component and the unit tests read the same answer.
 */

import { atLeast, type MemberRole } from "@/lib/roles";

export type PaletteCommandKey =
    | "people"
    | "tree"
    | "photos"
    | "places"
    | "sources"
    | "search"
    | "export"
    | "duplicates"
    | "trash"
    | "import"
    | "members"
    | "history";

export type PaletteCommand = {
    key: PaletteCommandKey;
    /** The last part of the address: /trees/<slug>/<path>. */
    path: string;
    /** The least role that may open the page; "" for every member. */
    role: "" | "editor" | "admin";
};

/** The pages of a tree, in the order the window lists them. */
export const TREE_COMMANDS: readonly PaletteCommand[] = [
    { key: "people", path: "persons", role: "" },
    { key: "tree", path: "tree", role: "" },
    { key: "photos", path: "gallery", role: "" },
    { key: "places", path: "places", role: "" },
    { key: "sources", path: "sources", role: "" },
    { key: "search", path: "search", role: "" },
    { key: "export", path: "tree/export", role: "" },
    { key: "duplicates", path: "duplicates", role: "editor" },
    { key: "trash", path: "trash", role: "editor" },
    { key: "import", path: "import", role: "editor" },
    { key: "members", path: "members", role: "" },
    { key: "history", path: "history", role: "admin" },
];

/** The pages a member of this role may open. */
export function commandsFor(role: MemberRole): PaletteCommand[] {
    return TREE_COMMANDS.filter((command) => command.role === "" || atLeast(role, command.role));
}

/** The address of a page of the tree, without the language prefix (the link adds that). */
export function commandHref(slug: string, command: PaletteCommand): string {
    return `/trees/${slug}/${command.path}`;
}

/** The tree the reader is inside, read from the path, or null on the way between trees. */
export function treeSlugOf(pathname: string): string | null {
    const match = /^\/trees\/([^/?#]+)/.exec(pathname);
    const slug = match?.[1];
    if (!slug) return null;
    try {
        return decodeURIComponent(slug);
    } catch {
        // A path a browser could not have sent: take it as it stands.
        return slug;
    }
}

/**
 * The selection after the arrow keys moved it by `delta`, round the ends of the list. An empty
 * list has no selection, which is -1: nothing can be opened.
 */
export function moveSelection(index: number, delta: number, count: number): number {
    if (count <= 0) return -1;
    return (((index + delta) % count) + count) % count;
}

/** The selection after the list changed: it stays on an item that is still there. */
export function clampSelection(index: number, count: number): number {
    if (count <= 0) return -1;
    return Math.min(Math.max(index, 0), count - 1);
}

/** The item an "Enter" opens, or null when the list is empty. */
export function selectedItem<T>(items: readonly T[], index: number): T | null {
    if (index < 0 || index >= items.length) return null;
    return items[index] ?? null;
}
