/**
 * Familee - the tree as a picture, to save or print
 *
 * The tree is drawn on the server as one SVG picture (src/lib/tree-image.ts). The page shows it and
 * offers it as SVG, as PNG (made in the browser from that same SVG) or for printing.
 */

import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TreeExport } from "@/components/trees/tree-export";
import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { treeImage } from "@/lib/tree-image";
import { loadTreeView } from "@/lib/tree-view";

/**
 * Familee - the whole tree as one picture
 *
 * The canvas belongs to the screen: it is drawn by React Flow, it moves and it zooms, and it cannot
 * be put into a letter or on a wall. This page draws the same tree on the server as one SVG and
 * offers it as a file - a picture to send, or paper through the printer.
 */

type Params = { locale: string; slug: string };

export default async function TreeExportPage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/tree/export`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const [membership] = await db
        .select({ selfPersonId: schema.treeMembers.selfPersonId })
        .from(schema.treeMembers)
        .where(
            and(
                eq(schema.treeMembers.treeId, access.treeId),
                eq(schema.treeMembers.userId, user.id),
            ),
        )
        .limit(1);

    const view = await loadTreeView(access.treeId, slug, membership?.selfPersonId ?? null);
    const t = await getTranslations();
    const taken = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date());

    const image = treeImage({
        title: access.title,
        nodes: view.nodes,
        edges: view.edges,
        labels: {
            unknown: t("common.unknown"),
            you: t("tree.view.you"),
            footer: t("tree.export.footer", { date: taken }),
        },
        // The life years as the canvas writes them, so a picture and the screen agree.
        years: (data) => {
            if (data.birthYear && data.deathYear) {
                return t("date.lifespan", { birth: data.birthYear, death: data.deathYear });
            }
            if (data.birthYear) return t("date.lifespanBirthOnly", { birth: data.birthYear });
            if (data.deathYear) return t("date.lifespanDeathOnly", { death: data.deathYear });
            return null;
        },
    });

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1 print:hidden">
                <Link href={`/trees/${slug}/tree`} className="text-primary text-sm">
                    {t("tree.export.back")}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("tree.export.title")}</h1>
                <p className="text-base-content/60 text-sm">{t("tree.export.hint")}</p>
            </header>

            {view.empty ? (
                <p className="text-base-content/60 text-sm print:hidden">{t("tree.empty")}</p>
            ) : (
                <TreeExport
                    svg={image.svg}
                    width={image.width}
                    height={image.height}
                    title={access.title}
                />
            )}
        </div>
    );
}
