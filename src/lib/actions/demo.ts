"use server";

/**
 * Familee - creating the demo tree from the profile of an administrator
 *
 * The same script that the "tools" compose service runs (db/seed.sql) is run here, through the
 * application's own database connection, so that anyone who started the project can
 * create the demo without a command line. The script replaces the tree with the slug "demo"; the
 * files of the old demo tree are removed with it. Only an administrator of the archive may do it.
 *
 * The script deletes whatever tree has the slug "demo", so the action first makes sure that tree
 * is the seed's own: the seed always creates it with one fixed id. A person's own tree under that
 * slug (made before the slug was reserved) is refused, not wiped.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { client, db, schema } from "@/db";
import { removeTreeFiles } from "@/lib/media-storage";
import { getCurrentUser } from "@/lib/session";
import { DEMO_SLUG } from "@/lib/validation";

export type DemoResult = { ok: true } | { ok: false; error: string };

/** The id db/seed.sql gives the demo tree; a "demo" tree with any other id is not the seed's. */
const DEMO_TREE_ID = "11111111-1111-4111-8111-111111111111";

export async function createDemoTreeAction(): Promise<DemoResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const [account] = await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
    if (account?.role !== "admin") return { ok: false, error: "auth.noPermission" };

    const [old] = await db
        .select({ id: schema.trees.id })
        .from(schema.trees)
        .where(eq(schema.trees.slug, DEMO_SLUG))
        .limit(1);
    if (old && old.id !== DEMO_TREE_ID) return { ok: false, error: "profile.demo.slugInUse" };

    try {
        const script = await readFile(path.join(process.cwd(), "db", "seed.sql"), "utf8");
        // A reserved connection: the script starts its own transaction, which the pool refuses to run.
        const connection = await client.reserve();
        try {
            await connection.unsafe(script);
        } catch (error) {
            // A failed statement leaves the script's transaction open and aborted; the connection
            // goes back to the pool, so the transaction is closed here first.
            await connection.unsafe("rollback").catch(() => undefined);
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("demo tree: the seed failed", error);
        return { ok: false, error: "profile.demo.failed" };
    }

    // The files go only after the seed has replaced the rows: a failed seed rolls back and leaves
    // the old demo tree whole, files included. The new tree has no files of its own yet.
    if (old) {
        await removeTreeFiles(old.id).catch((error) => {
            console.error("demo tree: the old files could not be removed", error);
        });
    }
    return { ok: true };
}
