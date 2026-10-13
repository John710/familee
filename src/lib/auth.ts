/**
 * Familee - the authentication server (better-auth)
 *
 * Accounts are created only from an invitation or by the first-run setup, so
 * public sign-up is switched off (disableSignUp). The server code creates users
 * through auth.$context (see src/lib/accounts.ts), never through the HTTP endpoint.
 *
 * Users, sessions, accounts and verifications live in Postgres under the
 * familee schema; the table and column names come from
 * db/migrations/0000_init.sql (usePlural and the camelCase properties of the
 * Drizzle mirror in src/db/schema/auth.ts).
 *
 * Redis is a cache in front of the sessions and the rate-limit counters.
 */

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import { db, schema } from "@/db";
import { redis } from "@/lib/redis";
import { redisSecondaryStorage } from "@/lib/secondary-storage";

const ONE_DAY = 60 * 60 * 24;

/** How long a reset link handed out by an administrator stays valid. */
export const RESET_LINK_SECONDS = 60 * 60;

/** The Redis key where the last reset link of an e-mail address waits to be taken. */
export function resetLinkKey(email: string): string {
    return `familee:reset:${email.trim().toLowerCase()}`;
}

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,

    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
        usePlural: true,
    }),

    secondaryStorage: redisSecondaryStorage(redis, "familee:auth:"),

    emailAndPassword: {
        enabled: true,
        /** No public sign-up: see the note above. */
        disableSignUp: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,

        /**
         * There is no mail server. The reset link is kept for an hour in Redis, and an
         * owner or an administrator of a tree takes it from the members page and hands
         * it to the person (see src/lib/actions/reset.ts).
         */
        sendResetPassword: async ({ user, url }) => {
            await redis.set(resetLinkKey(user.email), url, "EX", RESET_LINK_SECONDS);
        },
    },

    session: {
        /** A month, refreshed once a day while the person is using the archive. */
        expiresIn: 30 * ONE_DAY,
        updateAge: ONE_DAY,
        /** Postgres keeps the session; Redis only caches it. */
        storeSessionInDatabase: true,
    },

    /** Lets server actions set the session cookie. */
    plugins: [
        /** Sign-in by username as well as by e-mail; see the profile page. */
        username(),
        nextCookies(),
    ],
});

export type Auth = typeof auth;
