/**
 * Familee - users and access
 *
 * Mirrors the "USERS AND ACCESS" block of db/migrations/0000_init.sql:
 * users, sessions, accounts, verifications.
 *
 * The table and column names are dictated by better-auth (see src/lib/auth.ts:
 * modelName pluralises the names, fields turns them into snake_case).
 * id is text here rather than uuid: better-auth generates it.
 */

import { sql } from "drizzle-orm";
import { boolean, check, index, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

import { appRoleEnum, familee } from "./enums";

export const users = familee.table(
    "users",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull().default(""),
        email: text("email").notNull(),
        emailVerified: boolean("email_verified").notNull().default(false),
        image: text("image"),

        /** The login name of the username plugin (lower case, unique); optional. */
        username: text("username"),
        /** The name as the person typed it. */
        displayUsername: text("display_username"),

        /** The global role. Rights on a given tree live in tree_members. */
        role: appRoleEnum("role").notNull().default("viewer"),

        /** The interface language: the key of a messages/<locale>.json file. */
        locale: text("locale").notNull().default("ru"),

        banned: boolean("banned").notNull().default(false),
        banReason: text("ban_reason"),
        banExpires: timestamp("ban_expires", { withTimezone: true, mode: "date" }),

        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        unique("users_email_key").on(t.email),
        uniqueIndex("users_username_key").on(t.username),
        check("users_locale_format", sql`${t.locale} ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'`),
    ],
);

export const sessions = familee.table(
    "sessions",
    {
        id: text("id").primaryKey(),
        token: text("token").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        expiresAt: timestamp("expires_at", {
            withTimezone: true,
            mode: "date",
        }).notNull(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        unique("sessions_token_key").on(t.token),
        index("sessions_user_id_idx").on(t.userId),
        index("sessions_expires_at_idx").on(t.expiresAt),
    ],
);

export const accounts = familee.table(
    "accounts",
    {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at", {
            withTimezone: true,
            mode: "date",
        }),
        refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
            withTimezone: true,
            mode: "date",
        }),
        scope: text("scope"),

        /** The argon2id hash for password sign-in. Never sent to the client. */
        password: text("password"),

        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [
        unique("accounts_provider_account_key").on(t.providerId, t.accountId),
        index("accounts_user_id_idx").on(t.userId),
    ],
);

export const verifications = familee.table(
    "verifications",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expires_at", {
            withTimezone: true,
            mode: "date",
        }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
            .notNull()
            .defaultNow(),
    },
    (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
