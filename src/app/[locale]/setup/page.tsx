/**
 * Familee - the first-run page that creates the administrator account
 *
 * It is open only while the archive has no account at all. Its form creates the first administrator
 * and then leads to the list of trees.
 */

import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { SetupForm } from "@/components/auth/setup-form";
import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { hasAnyAccount } from "@/lib/accounts";

type Params = { locale: string };

/**
 * The first-run page. It exists only while the archive has no account at all:
 * after the first administrator is created, the address answers 404 for good.
 */
export default async function SetupPage({ params }: { params: Promise<Params> }) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    if (await hasAnyAccount()) {
        notFound();
    }

    return (
        <div className="flex justify-center py-10">
            <SetupForm next={localizedPath(locale, "/trees")} />
        </div>
    );
}
