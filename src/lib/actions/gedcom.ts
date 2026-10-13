"use server";

/**
 * Familee - server actions of the GEDCOM import
 *
 * Two steps: the preview reads the file and writes nothing; the import writes the
 * same plan. Both need the editor role or higher in the tree.
 */

import { importIntoTree } from "@/lib/gedcom-import";
import { planImport } from "@/lib/gedcom-plan";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

export type PreviewResult =
    | {
          ok: true;
          version: string;
          persons: number;
          unions: number;
          children: number;
          warnings: { xref: string; message: string }[];
      }
    | { ok: false; error: string };

export type CommitResult =
    | { ok: true; persons: number; unions: number; children: number; events: number }
    | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;

type Access =
    | { error: string; user?: undefined; access?: undefined }
    | { error?: undefined; user: { id: string }; access: { treeId: string } };

async function accessFor(slug: string): Promise<Access> {
    const user = await getCurrentUser();
    if (!user) return { error: "auth.needSignIn" };
    const access = await getTreeAccess(slug, user.id);
    if (!access || !atLeast(access.role as MemberRole, "editor")) {
        return { error: "auth.noPermission" };
    }
    return { user, access };
}

export async function previewGedcomAction(input: { slug: string; text: string }): Promise<PreviewResult> {
    const check = await accessFor(input.slug);
    if (check.error !== undefined) return { ok: false, error: check.error };
    if (input.text.length > MAX_BYTES) return { ok: false, error: "gedcom.tooLarge" };

    const plan = planImport(input.text);
    if (plan.persons.length === 0) return { ok: false, error: "gedcom.empty" };

    const children = plan.unions.reduce((total, union) => total + union.children.length, 0);
    return {
        ok: true,
        version: plan.version,
        persons: plan.persons.length,
        unions: plan.unions.length,
        children,
        warnings: plan.warnings.slice(0, 200),
    };
}

export async function commitGedcomAction(input: { slug: string; text: string }): Promise<CommitResult> {
    const check = await accessFor(input.slug);
    if (check.error !== undefined) return { ok: false, error: check.error };
    if (input.text.length > MAX_BYTES) return { ok: false, error: "gedcom.tooLarge" };

    const plan = planImport(input.text);
    if (plan.persons.length === 0) return { ok: false, error: "gedcom.empty" };

    const result = await importIntoTree({
        treeId: check.access.treeId,
        userId: check.user.id,
        plan,
    });
    if (!result.ok) return result;
    return { ok: true, persons: result.persons, unions: result.unions, children: result.children, events: result.events };
}
