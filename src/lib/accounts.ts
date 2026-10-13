/**
 * Familee - creating accounts on the server
 *
 * Public sign-up is closed (see src/lib/auth.ts), so the only two ways to get an
 * account are the first-run setup and an invitation. Both go through here: the
 * user row and the password hash are written with better-auth's own internal
 * adapter, so the password is hashed exactly the way sign-in expects.
 */

import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

export class AccountExistsError extends Error {
    constructor() {
        super("account already exists");
        this.name = "AccountExistsError";
    }
}

/** Whether the archive has any account yet. The setup page is closed after that. */
export async function hasAnyAccount(): Promise<boolean> {
    const [row] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    return row !== undefined;
}

/** Creates a user with a password. Throws AccountExistsError when the email is taken. */
export async function createAccount(input: {
    email: string;
    name: string;
    password: string;
}): Promise<{ id: string; email: string }> {
    const ctx = await auth.$context;
    const email = input.email.trim().toLowerCase();

    const existing = await ctx.internalAdapter.findUserByEmail(email);
    if (existing) {
        throw new AccountExistsError();
    }

    const user = await ctx.internalAdapter.createUser(
        {
            email,
            name: input.name.trim(),
            emailVerified: false,
        },
        { method: "email-password" },
    );

    const passwordHash = await ctx.password.hash(input.password);
    await ctx.internalAdapter.linkAccount({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: passwordHash,
    });

    return { id: user.id, email: user.email };
}
