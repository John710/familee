"use server";

/**
 * Familee - the logo of a tree
 *
 * The owner or an administrator uploads a PNG, JPEG or WebP picture. The server
 * checks the real format (sharp reads the picture, it does not trust the name),
 * turns it into a 256 x 256 WebP and keeps that in the tree. Anything else is refused.
 */

import { eq } from "drizzle-orm";
import sharp from "sharp";

import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type LogoResult = { ok: true; logoData: string | null } | { ok: false; error: string };

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SIDE = 256;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"] as const;

export async function setTreeLogoAction(input: { slug: string; dataUrl: string | null }): Promise<LogoResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "auth.needSignIn" };

    const access = await getTreeAccess(input.slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "admin")) {
        return { ok: false, error: "auth.noPermission" };
    }

    let logoData: string | null = null;

    if (input.dataUrl !== null) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl);
        if (!match || !(ALLOWED as readonly string[]).includes(match[1] ?? "")) {
            return { ok: false, error: "logo.invalid" };
        }
        const source = Buffer.from(match[2] ?? "", "base64");
        if (source.length === 0 || source.length > MAX_UPLOAD_BYTES) {
            return { ok: false, error: "logo.tooLarge" };
        }

        try {
            const picture = await sharp(source)
                .rotate()
                .resize(SIDE, SIDE, { fit: "cover" })
                .webp({ quality: 85 })
                .toBuffer();
            logoData = `data:image/webp;base64,${picture.toString("base64")}`;
        } catch {
            return { ok: false, error: "logo.invalid" };
        }
    }

    await db
        .update(schema.trees)
        .set({ logoData, updatedAt: new Date() })
        .where(eq(schema.trees.id, access.treeId));

    await writeAudit({
        treeId: access.treeId,
        userId: user.id,
        action: "update",
        entityType: "tree",
        entityId: access.treeId,
    });

    return { ok: true, logoData };
}
