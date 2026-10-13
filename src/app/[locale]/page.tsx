import { ImagePlus, TreeDeciduous, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

type LocaleParams = { locale: string };

export default async function HomePage({ params }: { params: Promise<LocaleParams> }) {
    const { locale } = await params;
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
                <p className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
                    {t("greeting")}
                </p>
                <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{t("lead")}</h1>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-base-content/70 text-sm font-semibold tracking-wide uppercase">
                    {t("steps.title")}
                </h2>

                <ol className="grid gap-4 sm:grid-cols-3">
                    {steps.map(({ key, Icon }, index) => (
                        <li key={key} className="person-card flex flex-col gap-3 p-5">
                            <div className="flex items-center gap-3">
                                <span className="bg-base-200 text-base-content/60 flex size-8 items-center justify-center rounded-full text-sm font-semibold">
                                    {index + 1}
                                </span>
                                <Icon className="text-primary size-5" />
                            </div>
                            <p className="text-sm leading-relaxed">{t(`steps.${key}`)}</p>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="border-base-300 rounded-box border border-dashed p-6">
                <p className="text-base-content/70 text-sm">{t("noTrees")}</p>
                <button type="button" className="btn btn-primary btn-sm mt-4" disabled>
                    {t("createTree")}
                </button>
            </section>
        </div>
    );
}
