/**
 * Familee - the change log
 *
 * Every write that matters leaves a row in familee.audit_log: who did what, to
 * which entity, in which tree. The changes column is filled for field edits
 * (phase 2); here the action and the entity are enough.
 */

import { db, schema } from "@/db";

export type AuditAction = (typeof schema.auditActionEnum.enumValues)[number];

export async function writeAudit(entry: {
    treeId: string | null;
    userId: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string | null;
}): Promise<void> {
    await db.insert(schema.auditLog).values({
        treeId: entry.treeId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
    });
}
