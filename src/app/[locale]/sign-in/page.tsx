/**
 * Familee - the sign-in page
 *
 * A person who is already signed in is sent on to the page they asked for, if it is a path of this
 * archive (the `next` parameter is checked by lib/safe-path.ts). Anybody else gets the form.
 */

import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { SignInForm } from "@/components/auth/sign-in-form";
import { localizedPath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { safeNextPath } from "@/lib/safe-path";
import { getCurrentUser } from "@/lib/session";

type Params = { locale: string };
type SearchParams = { next?: string };

export default async function SignInPage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<SearchParams>;
}) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const { next } = await searchParams;
    const target = safeNextPath(next);

    if (await getCurrentUser()) {
        redirect(localizedPath(locale, target));
    }

    return (
        <div className="flex justify-center py-10">
            <SignInForm next={localizedPath(locale, target)} />
        </div>
    );
}
