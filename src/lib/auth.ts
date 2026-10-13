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
import { APIError, createAuthMiddleware } from "better-auth/api";
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

/**
 * Sign-in attempts are counted per account, not per address: the address a request comes
 * from can be forged when the archive is reached without a proxy, the account name cannot.
 * Ten attempts within fifteen minutes stop the next ones until the window passes.
 */
const SIGN_IN_ATTEMPTS = 10;
const SIGN_IN_WINDOW_SECONDS = 15 * 60;

function signInAttemptsKey(identifier: string): string {
    return `familee:signin-attempts:${identifier.trim().toLowerCase()}`;
}

/** The identifier a sign-in request names: the e-mail address or the user name. */
function identifierOf(body: unknown): string | null {
    if (typeof body !== "object" || body === null) return null;
    const { email, username: name } = body as { email?: unknown; username?: unknown };
    const value = typeof email === "string" ? email : typeof name === "string" ? name : null;
    return value?.trim() ? value : null;
}

/**
 * The proxies in front of the archive, from TRUSTED_PROXIES (comma-separated addresses or
 * CIDR ranges): in the Traefik mode the network Traefik shares with the app. Without it,
 * better-auth reads the client address from X-Forwarded-For only when there is a single
 * address in it; with it, the proxies are skipped and the client is the first address that is
 * not one of them. Empty in the address-and-port mode, where there is no proxy.
 */
function trustedProxies(): string[] {
    return (process.env.TRUSTED_PROXIES ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
}

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,

    advanced: {
        ipAddress: {
            trustedProxies: trustedProxies(),
        },
    },

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

    /**
     * better-auth's own limiter counts by address. Its default for sign-in is three attempts in
     * ten seconds, which is too strict for a family archive where several people sign in at
     * once. Ten attempts a minute from one address is enough for a person who mistypes.
     */
    rateLimit: {
        enabled: true,
        customRules: {
            "/sign-in/email": { window: 60, max: 10 },
            "/sign-in/username": { window: 60, max: 10 },
        },
    },

    /**
     * Counts every sign-in attempt of an account (successful or not) and refuses the attempts
     * over the limit. The counter is kept in Redis for fifteen minutes from the first attempt.
     */
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-in/username") return;
            const identifier = identifierOf(ctx.body);
            if (!identifier) return;

            const key = signInAttemptsKey(identifier);
            const attempts = await redis.incr(key);
            if (attempts === 1) await redis.expire(key, SIGN_IN_WINDOW_SECONDS);
            if (attempts > SIGN_IN_ATTEMPTS) {
                throw new APIError("TOO_MANY_REQUESTS", {
                    message: "Too many sign-in attempts. Try again in a few minutes.",
                });
            }
        }),
    },

    /** Lets server actions set the session cookie. */
    plugins: [
        /** Sign-in by username as well as by e-mail; see the profile page. */
        username(),
        nextCookies(),
    ],
});

export type Auth = typeof auth;
