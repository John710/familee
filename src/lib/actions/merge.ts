"use server";

/**
 * Familee - merging two records of the same person
 *
 * The work itself is done by familee.merge_persons() (migrations 0013, 0017, 0019): one transaction
 * that moves the names, the events, the citations, the notes, the photographs and the unions onto
 * the survivor and removes the record that is left empty. What is here is the role check, the
 * reading of the answer and the note in the audit log, written in the same transaction as the merge.
 *
 * Editors and above, like every other change of the tree.
 */

import { type SQL, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { mergeErrorKey } from "@/lib/db-errors";
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

/**
 * Runs one merge function and writes its line in the history in one transaction: a merge is never
 * left without its audit row, and an audit row never stands for a merge that rolled back.
 * writeAudit() (src/lib/audit.ts) writes through the pool, not a transaction, so the row is
 * inserted here with the same columns.
 */
async function runMerge(
    call: SQL,
    entry: { treeId: string; userId: string; entityType: string; keepId: string; dropId: string },
): Promise<MergeSummary> {
    return db.transaction(async (tx) => {
        const rows = await tx.execute(
            sql`select ${call}(
                    ${entry.treeId}::uuid, ${entry.keepId}::uuid, ${entry.dropId}::uuid
                ) as merged`,
        );

        await tx.insert(schema.auditLog).values({
            treeId: entry.treeId,
            userId: entry.userId,
            action: "merge",
            entityType: entry.entityType,
            entityId: entry.keepId,
            changes: { merged: { from: entry.dropId, to: entry.keepId } },
        });

        return (rows[0]?.merged ?? {}) as MergeSummary;
    });
}

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
        summary = await runMerge(sql`familee.merge_persons`, {
            treeId: access.treeId,
            userId: user.id,
            entityType: "person",
            keepId: input.keepId,
            dropId: input.dropId,
        });
    } catch (error) {
        return { ok: false, error: mergeErrorKey(error, "person") };
    }

    return {
        ok: true,
        names: summary.names ?? 0,
        events: summary.events ?? 0,
        photos: summary.photos ?? 0,
        unions: summary.unions ?? 0,
    };
}

/**
 * Merging two places, or two sources.
 *
 * The same shape as a person: one call per record that goes, the work done by the database function
 * (migrations 0015, 0019) in one transaction. A place carries its events, its media and its notes
 * with it and its children become children of the survivor; a source carries its citations. Both
 * are checked against the tree and both leave a line in the history.
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
        summary = await runMerge(call, {
            treeId: access.treeId,
            userId: user.id,
            entityType: kind === "place" ? "place" : "source",
            keepId: input.keepId,
            dropId: input.dropId,
        });
    } catch (error) {
        return { ok: false, error: mergeErrorKey(error, kind) };
    }

    const moved = Object.values(summary).reduce((sum, count) => sum + (count ?? 0), 0);
    return { ok: true, moved };
}
