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
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { redis } from "@/lib/redis";
import { redisSecondaryStorage } from "@/lib/secondary-storage";
import {
    isSignInPath,
    SIGN_IN_WINDOW_SECONDS,
    signInAllowed,
    signInAttemptsKey,
    signInCounterName,
    signInFailed,
    signInIdentifier,
} from "@/lib/sign-in-guard";

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
 * Ten failed attempts within fifteen minutes stop the next ones until the window passes.
 *
 * The Redis key of the account a sign-in request names. A user name is looked up and counted
 * under the account's e-mail address, so /sign-in/email and /sign-in/username share a counter;
 * the username plugin compares names in lower case, and so does the lookup.
 */
async function signInCounterKey(path: string, body: unknown): Promise<string | null> {
    const identifier = signInIdentifier(path, body);
    if (!identifier) return null;

    let accountEmail: string | null = null;
    if (path === "/sign-in/username") {
        const [row] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.username, identifier.toLowerCase()))
            .limit(1);
        accountEmail = row?.email ?? null;
    }
    return signInAttemptsKey(signInCounterName(identifier, accountEmail));
}

/**
 * Takes one place in the counter and returns the count it reached. The increment and the expiry
 * go as one atomic transaction (as in secondary-storage.ts): a key left without an expiry would
 * count forever. `expire ... NX` keeps the window set by the first attempt.
 */
async function reserveSignInAttempt(key: string): Promise<number> {
    const replies = await redis.multi().incr(key).expire(key, SIGN_IN_WINDOW_SECONDS, "NX").exec();
    const value = replies?.[0]?.[1];
    return typeof value === "number" ? value : Number(value ?? 0);
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
        /**
         * A reset is how a stolen account is taken back, so it ends every session of the
         * account, including one opened with the old password. better-auth keeps them otherwise.
         */
        revokeSessionsOnPasswordReset: true,
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
        // Behind a proxy the address of the client is known, so the per-address rule counts it.
        // Without one (the address-and-port mode) every request would share one counter, so the
        // rule is off there; the limit per account above still holds.
        customRules: {
            "/sign-in/email": trustedProxies().length > 0 ? { window: 60, max: 10 } : false,
            "/sign-in/username": trustedProxies().length > 0 ? { window: 60, max: 10 } : false,
        },
    },

    /**
     * The counter of an account holds its attempts. Before the endpoint runs, the attempt reserves
     * its place atomically and is refused past the limit, so parallel requests cannot all pass one
     * reading of the counter. After it, a success clears the counter and a refusal keeps its
     * place. Keeping successes counted, as the first version did, locked a family out after ten
     * ordinary sign-ins in a quarter of an hour.
     */
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (!isSignInPath(ctx.path)) return;
            const key = await signInCounterKey(ctx.path, ctx.body);
            if (!key) return;

            if (!signInAllowed(await reserveSignInAttempt(key))) {
                throw new APIError("TOO_MANY_REQUESTS", {
                    message: "Too many sign-in attempts. Try again in a few minutes.",
                });
            }
        }),
        after: createAuthMiddleware(async (ctx) => {
            if (!isSignInPath(ctx.path)) return;
            if (signInFailed(ctx.context.returned)) return;
            const key = await signInCounterKey(ctx.path, ctx.body);
            if (key) await redis.del(key);
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
