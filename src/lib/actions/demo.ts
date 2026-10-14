"use server";

/**
 * Familee - creating the demo tree from the profile of an administrator
 *
 * The same script that "docker compose run --rm migrate seed" runs (db/seed.sql) is run here,
 * through the application's own database connection, so that anyone who started the project can
 * create the demo without a command line. The script replaces the tree with the slug "demo"; the
 * files of the old demo tree are removed with it. Only an administrator of the archive may do it.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { client, db, schema } from "@/db";
import { removeTreeFiles } from "@/lib/media-storage";
import { getCurrentUser } from "@/lib/session";

export type DemoResult = { ok: true } | { ok: false; error: string };

export async function createDemoTreeAction(): Promise<DemoResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const [account] = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
    if (account?.role !== "admin") return { ok: false, error: "auth.noPermission" };

    try {
        // The folder of the old demo tree goes first: the script deletes its rows.
        const [old] = await db
            .select({ id: schema.trees.id })
            .from(schema.trees)
            .where(eq(schema.trees.slug, "demo"))
            .limit(1);
        if (old) await removeTreeFiles(old.id);

        // The script has its own BEGIN and COMMIT and several statements: it runs as one
        // simple query on one connection.
        const script = await readFile(path.join(process.cwd(), "db", "seed.sql"), "utf8");
        await client.unsafe(script);
        return { ok: true };
    } catch (error) {
        console.error("demo tree: the seed failed", error);
        return { ok: false, error: "profile.demo.failed" };
    }
}
