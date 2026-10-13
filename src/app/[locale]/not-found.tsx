import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
    const t = await getTranslations("errors");

    return (
        <div className="flex flex-col items-start gap-4 py-12">
            <p className="text-base-content/40 font-serif text-6xl leading-none">404</p>
            <h1 className="text-2xl font-semibold">{t("notFound")}</h1>
            <p className="text-base-content/70 text-sm">{t("notFoundHint")}</p>
            <Link href="/" className="btn btn-primary btn-sm mt-2">
                {t("goHome")}
            </Link>
        </div>
    );
}
