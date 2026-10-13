import { ImagePlus, TreeDeciduous, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type LocaleParams = { locale: string };

export default async function HomePage({ params }: { params: Promise<LocaleParams> }) {
    const { locale } = await params;

    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    setRequestLocale(locale);

    const t = await getTranslations("home");

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
                <h1 className="mt-3 font-semibold text-4xl sm:text-5xl">{t("lead")}</h1>
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

            <section className="rounded-box border border-base-300 border-dashed p-6">
                <p className="text-base-content/70 text-sm">{t("noTrees")}</p>
                <Link href="/trees" className="btn btn-primary btn-sm mt-4">
                    {t("openTree")}
                </Link>
            </section>
        </div>
    );
}
