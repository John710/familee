import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
    const t = await getTranslations("errors");

    return (
        <div className="flex flex-col items-start gap-4 py-12">
            <p className="font-serif text-6xl text-base-content/40 leading-none">404</p>
            <h1 className="font-semibold text-2xl">{t("notFound")}</h1>
            <p className="text-base-content/70 text-sm">{t("notFoundHint")}</p>
            <Link href="/" className="btn btn-primary btn-sm mt-2">
                {t("goHome")}
            </Link>
        </div>
    );
}
