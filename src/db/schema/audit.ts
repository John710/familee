/**
 * Familee - the audit log
 *
 * Mirrors the "AUDIT LOG" block of db/migrations/0000_init.sql: audit_log.
 *
 * changes keeps the diff as {"field": {"from": ..., "to": ...}}, which is
 * enough to undo an edit by hand.
 *
 * entity_id is deliberately text and not uuid: the log also receives rows
 * with a text key (users.id from better-auth, event_types.code).
 */

import { bigint, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { auditActionEnum, familee } from "./enums";
import { trees } from "./trees";

/** One field of a diff: the value before and after the edit. */
export type AuditChange = { from: unknown; to: unknown };

export const auditLog = familee.table(
    "audit_log",
    {
        id: bigint("id", { mode: "number" })
            .generatedAlwaysAsIdentity()
            .primaryKey(),

        /** null - an action outside a tree: a sign-up, a role change. */
        treeId: uuid("tree_id").references(() => trees.id, {
            onDelete: "cascade",
        }),
        userId: text("user_id").references(() => users.id, {
            onDelete: "set null",
        }),

        action: auditActionEnum("action").notNull(),
        entityType: text("entity_type").notNull(),
        entityId: text("entity_id"),
        changes: jsonb("changes").$type<Record<string, AuditChange>>(),
        ipAddress: text("ip_address"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        index("audit_log_tree_created_idx").on(t.treeId, t.createdAt.desc()),
        index("audit_log_entity_idx").on(t.entityType, t.entityId),
        index("audit_log_user_idx").on(t.userId, t.createdAt.desc()),
    ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
