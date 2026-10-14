import { ImagePlus, TreeDeciduous, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { birthdayItems } from "@/components/layout/birthday-bell";
import { PersonThumb } from "@/components/persons/person-thumb";
import { TreeLogo } from "@/components/trees/tree-logo";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { BIRTHDAY_DAYS, birthdaysForUser } from "@/lib/birthdays";
import { listTreesForUser } from "@/lib/invitations";
import { getCurrentUser } from "@/lib/session";

type LocaleParams = { locale: string };

export default async function HomePage({ params }: { params: Promise<LocaleParams> }) {
    const { locale } = await params;

    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    setRequestLocale(locale);

    const t = await getTranslations("home");
    const tTrees = await getTranslations("tree");
    const tEnums = await getTranslations("enums");
    const tAuth = await getTranslations("auth");

    const user = await getCurrentUser();
    const trees = user ? await listTreesForUser(user.id) : [];
    const birthdays = user
        ? await birthdayItems(await birthdaysForUser(user.id, BIRTHDAY_DAYS, 30))
        : [];
    const tBirthdays = await getTranslations("birthdays");

    const steps = [
        { key: "one" as const, Icon: TreeDeciduous },
        { key: "two" as const, Icon: Users },
        { key: "three" as const, Icon: ImagePlus },
    ];

    return (
        <div className="flex flex-col gap-10">
            <section className="max-w-2xl">
                <p className="font-semibold text-primary text-xs uppercase tracking-[0.14em]">
                    {t("greeting")}
                </p>
                <h1 className="mt-3 font-semibold text-2xl sm:text-3xl">{t("lead")}</h1>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="font-semibold text-base-content/70 text-sm uppercase tracking-wide">
                    {t("steps.title")}
                </h2>

                <ol className="grid gap-4 sm:grid-cols-3">
                    {steps.map(({ key, Icon }, index) => (
                        <li key={key} className="person-card flex flex-col gap-3 p-5">
                            <div className="flex items-center gap-3">
                                <span className="flex size-8 items-center justify-center rounded-full bg-base-200 font-semibold text-base-content/60 text-sm">
                                    {index + 1}
                                </span>
                                <Icon className="size-5 text-primary" />
                            </div>
                            <p className="text-sm leading-relaxed">{t(`steps.${key}`)}</p>
                        </li>
                    ))}
                </ol>
            </section>

            {user && (
                <section className="flex flex-col gap-3">
                    <h2 className="font-semibold text-base-content/70 text-sm uppercase tracking-wide">
                        {tBirthdays("title")}
                    </h2>
                    {birthdays.length === 0 ? (
                        <p className="text-base-content/60 text-sm">{tBirthdays("none")}</p>
                    ) : (
                        <ul className="grid gap-2 sm:grid-cols-2">
                            {birthdays.map((item) => (
                                <li key={item.key}>
                                    <Link
                                        href={item.href}
                                        className="card card-border flex flex-row items-center gap-3 bg-base-100 p-3 transition-colors hover:border-primary"
                                    >
                                        <PersonThumb name={item.name} photoUrl={item.photoUrl} />
                                        <span className="flex min-w-0 flex-col gap-0.5">
                                            <span className="font-medium text-sm">{item.name}</span>
                                            <span className="text-base-content/60 text-xs">
                                                {item.dayLabel} · {item.turnsLabel} ·{" "}
                                                {item.treeTitle}
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {user ? (
                trees.length > 0 ? (
                    <section className="flex flex-col gap-3">
                        <h2 className="font-semibold text-base-content/70 text-sm uppercase tracking-wide">
                            {tTrees("many")}
                        </h2>
                        <ul className="grid gap-3 sm:grid-cols-2">
                            {trees.map((tree) => (
                                <li key={tree.slug}>
                                    <Link
                                        href={`/trees/${tree.slug}/members`}
                                        className="card card-border bg-base-100 transition-colors hover:border-primary"
                                    >
                                        <div className="card-body flex-row items-center gap-3 p-4">
                                            <TreeLogo
                                                logoData={tree.logoData}
                                                title={tree.title}
                                                size="sm"
                                            />
                                            <div className="flex flex-col">
                                                <span className="font-semibold">{tree.title}</span>
                                                <span className="text-base-content/60 text-xs">
                                                    {tEnums(`member_role.${tree.role}`)}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : (
                    <section className="rounded-box border border-base-300 border-dashed p-6">
                        <p className="text-base-content/70 text-sm">{t("noTrees")}</p>
                        <Link href="/trees" className="btn btn-primary btn-sm mt-4">
                            {t("openTree")}
                        </Link>
                    </section>
                )
            ) : (
                <section className="rounded-box border border-base-300 border-dashed p-6">
                    <p className="text-base-content/70 text-sm">{t("signInHint")}</p>
                    <Link href="/sign-in" className="btn btn-primary btn-sm mt-4">
                        {tAuth("signIn")}
                    </Link>
                </section>
            )}
        </div>
    );
}
