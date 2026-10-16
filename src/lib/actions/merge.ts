"use server";

/**
 * Familee - merging two records of the same person
 *
 * The work itself is done by familee.merge_persons() (migration 0013): one transaction that moves
 * the names, the events, the citations, the notes, the photographs and the unions onto the survivor
 * and removes the record that is left empty. What is here is the role check, the reading of the
 * answer and the note in the audit log.
 *
 * Editors and above, like every other change of the tree.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { writeAudit } from "@/lib/audit";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type MergeResult =
    | { ok: true; names: number; events: number; photos: number; unions: number }
    | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the database function reports back, as it builds it. */
type MergeSummary = {
    names?: number;
    events?: number;
    citations?: number;
    notes?: number;
    photos?: number;
    unions?: number;
    members?: number;
    media?: number;
    links?: number;
    children?: number;
};

export type RecordMergeResult = { ok: true; moved: number } | { ok: false; error: string };

export async function mergePersonsAction(input: {
    slug: string;
    /** The record that stays. */
    keepId: string;
    /** The record that goes, with everything of it moving to the keeper. */
    dropId: string;
}): Promise<MergeResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }
    if (!UUID.test(input.keepId) || !UUID.test(input.dropId)) {
        return { ok: false, error: "duplicates.notFound" };
    }
    if (input.keepId === input.dropId) return { ok: false, error: "duplicates.samePerson" };

    let summary: MergeSummary;
    try {
        const rows = await db.execute(
            sql`select familee.merge_persons(
                    ${access.treeId}::uuid, ${input.keepId}::uuid, ${input.dropId}::uuid
                ) as merged`,
        );
        summary = (rows[0]?.merged ?? {}) as MergeSummary;
    } catch (error) {
        return { ok: false, error: translate(error) };
    }

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "merge",
        entityType: "person",
        entityId: input.keepId,
        changes: { merged: { from: input.dropId, to: input.keepId } },
    });

    return {
        ok: true,
        names: summary.names ?? 0,
        events: summary.events ?? 0,
        photos: summary.photos ?? 0,
        unions: summary.unions ?? 0,
    };
}

/** The markers the function raises become a message for the reader. */
function translate(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("merge_self")) return "duplicates.samePerson";
    if (message.includes("merge_not_found")) return "duplicates.notFound";
    if (message.includes("own ancestor") || message.includes("pedigree cycle")) {
        return "errors.cycle";
    }
    if (message.includes("already a partner")) return "errors.duplicatePartner";
    return "errors.generic";
}

/**
 * Merging two places, or two sources.
 *
 * The same shape as a person: one call per record that goes, the work done by the database function
 * (migration 0015) in one transaction. A place carries its events, its media and its notes with it
 * and its children become children of the survivor; a source carries its citations. Both are checked
 * against the tree and both leave a line in the history.
 */
export async function mergePlacesAction(input: {
    slug: string;
    keepId: string;
    dropId: string;
}): Promise<RecordMergeResult> {
    return mergeRecord("place", input);
}

export async function mergeSourcesAction(input: {
    slug: string;
    keepId: string;
    dropId: string;
}): Promise<RecordMergeResult> {
    return mergeRecord("source", input);
}

async function mergeRecord(
    kind: "place" | "source",
    input: { slug: string; keepId: string; dropId: string },
): Promise<RecordMergeResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { ok: false, error: "auth.noPermission" };
    }
    if (!UUID.test(input.keepId) || !UUID.test(input.dropId)) {
        return { ok: false, error: `${kind}.notFound` };
    }
    if (input.keepId === input.dropId) return { ok: false, error: "duplicates.sameRecord" };

    let summary: MergeSummary;
    try {
        // The function name is one of two fixed strings, so nothing of the caller reaches the query.
        const call = kind === "place" ? sql`familee.merge_places` : sql`familee.merge_sources`;
        const rows = await db.execute(
            sql`select ${call}(
                    ${access.treeId}::uuid, ${input.keepId}::uuid, ${input.dropId}::uuid
                ) as merged`,
        );
        summary = (rows[0]?.merged ?? {}) as MergeSummary;
    } catch (error) {
        return { ok: false, error: translateRecord(error, kind) };
    }

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "merge",
        entityType: kind === "place" ? "place" : "source",
        entityId: input.keepId,
        changes: { merged: { from: input.dropId, to: input.keepId } },
    });

    const moved = Object.values(summary).reduce((sum, count) => sum + (count ?? 0), 0);
    return { ok: true, moved };
}

/** The markers of the two functions above become a message for the reader. */
function translateRecord(error: unknown, kind: "place" | "source"): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("merge_self")) return "duplicates.sameRecord";
    if (message.includes("merge_not_found")) return `${kind}.notFound`;
    return "errors.generic";
}
