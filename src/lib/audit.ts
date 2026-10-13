/**
 * Familee - the change log
 *
 * Every write that matters leaves a row in familee.audit_log: who did what, to which entity,
 * in which tree. For an edit of fields the row also carries the diff in `changes`, as
 * {"field": {"from": old, "to": new}}, so that an edit can be read and undone by hand.
 */

import { db, schema } from "@/db";

export type AuditAction = (typeof schema.auditActionEnum.enumValues)[number];
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

export async function writeAudit(entry: {
    treeId: string | null;
    userId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string | null;
    changes?: AuditChanges | null;
}): Promise<void> {
    await db.insert(schema.auditLog).values({
        treeId: entry.treeId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        changes: entry.changes ?? null,
    });
}

/**
 * The fields that differ between the values before and after an edit. An empty string and a
 * missing value count as the same thing (null), so retyping nothing is not a change.
 * Returns null when nothing changed.
 */
export function diffFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
): AuditChanges | null {
    const normalise = (value: unknown) => (value === undefined || value === "" ? null : value);
    const changes: AuditChanges = {};
    for (const key of Object.keys(after)) {
        const from = normalise(before[key]);
        const to = normalise(after[key]);
        if (from !== to) changes[key] = { from, to };
    }
    return Object.keys(changes).length > 0 ? changes : null;
}
