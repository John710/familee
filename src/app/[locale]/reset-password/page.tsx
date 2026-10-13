import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";

type Params = { locale: string };
type SearchParams = { token?: string; error?: string };

/**
 * The page the reset link leads to. better-auth turns the link into ?token=… here;
 * an expired or used link comes back with ?error=INVALID_TOKEN.
 */
export default async function ResetPasswordPage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<SearchParams>;
}) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const { token, error } = await searchParams;
    const t = await getTranslations("auth");

    if (!token || error) {
        return (
            <div className="flex justify-center py-10">
                <section className="card card-border w-full max-w-sm bg-base-100">
                    <div className="card-body">
                        <p role="status" className="text-sm">
                            {t("resetInvalid")}
                        </p>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="flex justify-center py-10">
            <ResetPasswordForm token={token} signInPath={localizedPath(locale, "/sign-in")} />
        </div>
    );
}
