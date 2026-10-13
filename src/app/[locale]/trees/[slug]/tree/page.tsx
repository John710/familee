import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TreeCanvas } from "@/components/trees/tree-canvas";
import { db, schema } from "@/db";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { atLeast } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";
import { loadTreeView } from "@/lib/tree-view";

type Params = { locale: string; slug: string };

export default async function TreePage({ params }: { params: Promise<Params> }) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/tree`);
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

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("tree.view.open")}</h1>
                <p className="text-base-content/60 text-sm">{t("tree.view.hint")}</p>
            </header>

            {view.empty ? (
                <section className="card card-border bg-base-100">
                    <div className="card-body">
                        <p className="text-base-content/60 text-sm">{t("tree.empty")}</p>
                    </div>
                </section>
            ) : (
                <section
                    className="h-[70dvh] min-h-[420px] overflow-hidden rounded-box border border-base-300 bg-base-200/40"
                    aria-label={t("tree.view.open")}
                >
                    <TreeCanvas
                        nodes={view.nodes}
                        edges={view.edges}
                        canEdit={atLeast(access.role, "editor")}
                    />
                </section>
            )}
        </div>
    );
}
