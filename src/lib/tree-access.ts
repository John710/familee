/**
 * Familee - what a person may do in a tree
 *
 * The rights are granted per tree in familee.tree_members. The roles and their
 * order are in ./roles.ts. Checks happen here, on the server, before any data is
 * read or written; the interface only hides buttons.
 */

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import type { MemberRole } from "@/lib/roles";

export type TreeAccess = {
    treeId: string;
    slug: string;
    title: string;
    role: MemberRole;
};

/** The tree and the caller's role in it, or null when the caller is not a member. */
export async function getTreeAccess(slug: string, userId: string): Promise<TreeAccess | null> {
    const [row] = await db
        .select({
            treeId: schema.trees.id,
            slug: schema.trees.slug,
            title: schema.trees.title,
            role: schema.treeMembers.role,
        })
        .from(schema.treeMembers)
        .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMembers.treeId))
        .where(and(eq(schema.trees.slug, slug), eq(schema.treeMembers.userId, userId)))
        .limit(1);

    return row ?? null;
}
