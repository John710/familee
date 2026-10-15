"use server";

/**
 * Familee - server actions of the GEDCOM import
 *
 * The browser sends the bytes of the file (base64); the server decodes them by the
 * character set of the file (src/lib/gedcom-text.ts) and reads the records.
 * Two steps: the preview writes nothing; the import writes the same plan. Both need
 * the editor role or higher in the tree.
 */

import { getTranslations } from "next-intl/server";
import { loadDateWords } from "@/lib/date-words";
import { bestMatch, cardToDuplicate, indexByName } from "@/lib/duplicates";
import { importIntoTree, planDuplicate } from "@/lib/gedcom-import";
import { type PlanContext, type PlanKey, planImport } from "@/lib/gedcom-plan";
import { decodeGedcomBytes } from "@/lib/gedcom-text";
import { listPersonCards } from "@/lib/people";
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
          /** The people of the file who look like somebody already in the tree. */
          duplicates: { xref: string; name: string; existing: string }[];
      }
    | { ok: false; error: string };

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

/** The file as text, with the note of the decoding; error is set when the file is refused. */
function readFile(base64: string): { error: string | null; text: string; note: string | null } {
    if (base64.length > Math.ceil((MAX_BYTES * 4) / 3)) {
        return { error: "gedcom.tooLarge", text: "", note: null };
    }
    const decoded = decodeGedcomBytes(Buffer.from(base64, "base64"));
    return { error: null, text: decoded.text, note: decoded.note };
}

export async function previewGedcomAction(input: {
    slug: string;
    bytes: string;
}): Promise<PreviewResult> {
    const check = await accessFor(input.slug);
    if (check.error !== undefined) return { ok: false, error: check.error };

    const file = readFile(input.bytes);
    if (file.error !== null) return { ok: false, error: file.error };

    const plan = planImport(file.text, await planContext());
    if (plan.persons.length === 0) return { ok: false, error: "gedcom.empty" };

    const children = plan.unions.reduce((total, union) => total + union.children.length, 0);
    const notes = file.note ? [{ xref: "file", message: file.note }] : [];

    // Who of the file looks like somebody already in the tree. The import joins those people to the
    // record that is there instead of creating them again, so the reader has to see them first.
    const cards = await listPersonCards(check.access.treeId);
    const index = indexByName(cards.map(cardToDuplicate));
    const namesById = new Map(cards.map((card) => [card.personId, card.fullName ?? ""]));
    const duplicates: { xref: string; name: string; existing: string }[] = [];
    const taken = new Set<string>();
    for (const person of plan.persons) {
        const shape = planDuplicate(person);
        const match = bestMatch(shape, index);
        if (!match || taken.has(match.personId)) continue;
        taken.add(match.personId);
        duplicates.push({
            xref: person.xref,
            name: shape.fullName ?? "",
            existing: namesById.get(match.personId) ?? "",
        });
    }

    return {
        ok: true,
        version: plan.version,
        persons: plan.persons.length,
        unions: plan.unions.length,
        children,
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

    const file = readFile(input.bytes);
    if (file.error !== null) return { ok: false, error: file.error };

    const plan = planImport(file.text, await planContext());
    if (plan.persons.length === 0) return { ok: false, error: "gedcom.empty" };

    const result = await importIntoTree({
        treeId: check.access.treeId,
        userId: check.user.id,
        plan,
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
