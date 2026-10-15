/**
 * Familee - atomic creation of password accounts
 *
 * Better Auth supplies the password hasher; Drizzle writes the user and credential in
 * one transaction. Calling the internal adapter here would use a different connection
 * and leave a user without credentials if the second write failed.
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

/**
 * The identity of the account-creation lock. Any number pair works; these two are fixed so every
 * server that creates accounts takes the same lock and the setup predicate cannot be raced.
 */
const ACCOUNT_LOCK_NS = 1451837801;
const ACCOUNT_LOCK_ID = 1;

export class AccountExistsError extends Error {
    constructor() {
        super("account already exists");
        this.name = "AccountExistsError";
    }
}

export class SetupClosedError extends Error {
    constructor() {
        super("setup is closed");
        this.name = "SetupClosedError";
    }
}

/** Whether the archive has any account yet. The setup page is closed after that. */
export async function hasAnyAccount(): Promise<boolean> {
    const [row] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    return row !== undefined;
}

/** Creates both rows atomically, optionally claiming the first administrator slot. */
export async function createAccount(input: {
    email: string;
    name: string;
    password: string;
    setup?: boolean;
}): Promise<{ id: string; email: string }> {
    const ctx = await auth.$context;
    const email = input.email.trim().toLowerCase();
    // Hash before taking the lock: expensive work must not hold up other requests.
    const password = await ctx.password.hash(input.password);

    return db.transaction(async (tx) => {
        // All account creation shares this lock, including invitations. The setup
        // predicate is checked only after acquiring it, on the same connection.
        await tx.execute(
            sql`select pg_advisory_xact_lock(${ACCOUNT_LOCK_NS}::int, ${ACCOUNT_LOCK_ID}::int)`,
        );
        if (input.setup) {
            const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).limit(1);
            if (existing) throw new SetupClosedError();
        }

        const id = randomUUID();
        const [user] = await tx
            .insert(schema.users)
            .values({
                id,
                email,
                name: input.name.trim(),
                emailVerified: false,
                role: input.setup ? "admin" : "viewer",
            })
            .onConflictDoNothing({ target: schema.users.email })
            .returning({ id: schema.users.id, email: schema.users.email });
        if (!user) throw new AccountExistsError();

        await tx.insert(schema.accounts).values({
            id: randomUUID(),
            userId: id,
            providerId: "credential",
            accountId: id,
            password,
        });
        return user;
    });
}
