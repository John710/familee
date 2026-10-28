"use server";

/**
 * Familee - server actions of the GEDCOM import
 *
 * The browser sends the bytes of the file (base64); the server decodes them by the
 * character set of the file (src/lib/gedcom-text.ts) and reads the records.
 * Two steps: the preview writes nothing; the import writes the same plan. Both need
 * the editor role or higher in the tree.
 *
 * The body of the request is the base64 text, a third larger than the file: next.config.ts
 * lets server actions and the proxy take 35 MB, enough for a file of GEDCOM_MAX_BYTES.
 */

import { getTranslations } from "next-intl/server";
import { loadDateWords } from "@/lib/date-words";
import { importIntoTree, joinsFor, planDuplicate } from "@/lib/gedcom-import";
import { type ImportPlan, type PlanContext, type PlanKey, planImport } from "@/lib/gedcom-plan";
import { decodeGedcomBytes, GEDCOM_MAX_BYTES } from "@/lib/gedcom-text";
import { atLeast, type MemberRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

/** A refusal: the key of the message, and for a file that cannot be imported, its faults. */
type Refused = { ok: false; error: string; details?: { xref: string; message: string }[] };

export type PreviewResult =
    | {
          ok: true;
          version: string;
          persons: number;
          unions: number;
          children: number;
          /** The people of the file the import joins to people already in the tree. */
          joined: number;
          /** The people of the file the import creates. */
          created: number;
          warnings: { xref: string; message: string }[];
          /** The people of the file who are joined, with the record each one joins (first 100). */
          duplicates: { xref: string; name: string; existing: string }[];
      }
    | Refused;

export type CommitResult =
    | {
          ok: true;
          persons: number;
          unions: number;
          children: number;
          events: number;
          /** The people of the file who joined a record already in the tree. */
          joined: number;
      }
    | Refused;

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

/** The file as text, with the translated note of the decoding; error is set when it is refused. */
async function readFile(
    base64: string,
): Promise<{ error: string | null; text: string; note: string | null }> {
    // Four characters of base64 carry three bytes; the padding may add up to two more.
    if (typeof base64 !== "string" || base64.length > Math.ceil(GEDCOM_MAX_BYTES / 3) * 4) {
        return { error: "gedcom.tooLarge", text: "", note: null };
    }
    const decoded = decodeGedcomBytes(Buffer.from(base64, "base64"));
    const t = await getTranslations("gedcom.decode");
    return {
        error: null,
        text: decoded.text,
        note: decoded.note ? t(decoded.note as Parameters<typeof t>[0]) : null,
    };
}

/** The plan of the file, or the refusal the reader sees instead. */
async function planOf(text: string): Promise<{ plan: ImportPlan } | { refused: Refused }> {
    const plan = planImport(text, await planContext());
    if (plan.refusals.length > 0) {
        return {
            refused: { ok: false, error: "gedcom.refused", details: plan.refusals.slice(0, 50) },
        };
    }
    if (plan.persons.length === 0) return { refused: { ok: false, error: "gedcom.empty" } };
    return { plan };
}

export async function previewGedcomAction(input: {
    slug: string;
    bytes: string;
}): Promise<PreviewResult> {
    const check = await accessFor(input.slug);
    if (check.error !== undefined) return { ok: false, error: check.error };

    const file = await readFile(input.bytes);
    if (file.error !== null) return { ok: false, error: file.error };

    const planned = await planOf(file.text);
    if ("refused" in planned) return planned.refused;
    const { plan } = planned;

    const children = plan.unions.reduce((total, union) => total + union.children.length, 0);
    const notes = file.note ? [{ xref: "file", message: file.note }] : [];

    // Who of the file is joined to somebody already in the tree instead of being created again.
    // The reader has to see them before the import writes anything.
    const { joins, names } = await joinsFor(check.access.treeId, plan);
    const duplicates: { xref: string; name: string; existing: string }[] = [];
    for (const person of plan.persons) {
        const existingId = joins.get(person.xref);
        if (!existingId) continue;
        duplicates.push({
            xref: person.xref,
            name: planDuplicate(person).fullName ?? "",
            existing: names.get(existingId) ?? "",
        });
    }

    return {
        ok: true,
        version: plan.version,
        persons: plan.persons.length,
        unions: plan.unions.length,
        children,
        joined: joins.size,
        created: plan.persons.length - joins.size,
        warnings: [...notes, ...plan.warnings].slice(0, 200),
        duplicates: duplicates.slice(0, 100),
    };
}

export async function commitGedcomAction(input: {
    slug: string;
    bytes: string;
}): Promise<CommitResult> {
    const check = await accessFor(input.slug);
    if (check.error !== undefined) return { ok: false, error: check.error };

    const file = await readFile(input.bytes);
    if (file.error !== null) return { ok: false, error: file.error };

    const planned = await planOf(file.text);
    if ("refused" in planned) return planned.refused;

    const result = await importIntoTree({
        treeId: check.access.treeId,
        userId: check.user.id,
        plan: planned.plan,
        words: await loadDateWords(),
    });
    if (!result.ok) return result;
    return {
        ok: true,
        persons: result.persons,
        unions: result.unions,
        children: result.children,
        events: result.events,
        joined: result.joined,
    };
}

/** The date words and the translated messages of the request, for the GEDCOM planner. */
async function planContext(): Promise<PlanContext> {
    const words = await loadDateWords();
    const t = await getTranslations("gedcom.plan");
    return {
        words,
        t: (key: PlanKey, values?: Record<string, string | number>) =>
            t(key as Parameters<typeof t>[0], values),
    };
}
