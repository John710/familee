/**
 * Familee - invitations
 *
 * Mirrors the "INVITATIONS" block of db/migrations/0003_invitations_and_living.sql.
 *
 * An account appears only through an invitation: public sign-up is closed. The
 * token from the link is never stored, only its SHA-256 hash (token_hash).
 */

import { sql } from "drizzle-orm";
import { check, index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { familee, memberRoleEnum } from "./enums";
import { trees } from "./trees";

export const invitations = familee.table(
    "invitations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        treeId: uuid("tree_id")
            .notNull()
            .references(() => trees.id, { onDelete: "cascade" }),

        /** Only the account with this address can accept the invitation. */
        email: text("email").notNull(),

        /** The rights the new member gets. The owner role is never given by invitation. */
        role: memberRoleEnum("role").notNull().default("viewer"),

        /** SHA-256 hex of the token from the link. */
        tokenHash: text("token_hash").notNull(),

        invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
        expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
        acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
        acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
        revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        unique("invitations_token_hash_key").on(t.tokenHash),
        check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
        check("invitations_role_not_owner", sql`${t.role} <> 'owner'`),
        check("invitations_expires_after_created", sql`${t.expiresAt} > ${t.createdAt}`),
        index("invitations_tree_idx").on(t.treeId),
        index("invitations_email_idx").on(t.email),
    ],
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
