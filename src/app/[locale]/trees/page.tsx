import { TreePine } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CreateTreeForm } from "@/components/trees/create-tree-form";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { listTreesForUser } from "@/lib/invitations";
import { requireUser } from "@/lib/session";

type Params = { locale: string };

export default async function TreesPage({ params }: { params: Promise<Params> }) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, "/trees");
    const trees = await listTreesForUser(user.id);
    const t = await getTranslations();

    return (
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
            <section className="flex flex-col gap-4">
                <h1 className="font-semibold font-serif text-3xl">{t("tree.many")}</h1>

                {trees.length === 0 ? (
                    <p className="text-base-content/70">{t("home.noTrees")}</p>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {trees.map((tree) => (
                            <li key={tree.slug}>
                                <Link
                                    href={`/trees/${tree.slug}/members`}
                                    className="card card-border bg-base-100 transition-colors hover:border-primary"
                                >
                                    <div className="card-body flex-row items-center gap-3 p-4">
                                        <TreePine className="size-5 text-primary" />
                                        <div className="flex flex-col">
                                            <span className="font-semibold">{tree.title}</span>
                                            <span className="text-base-content/60 text-xs">
                                                {t(`enums.member_role.${tree.role}`)}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <CreateTreeForm />
        </div>
    );
}
