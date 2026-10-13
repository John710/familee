/**
 * Familee - the top bar
 *
 * The name of the archive, the link to the trees and the account actions on the
 * left and right; the two switchers stay at the end. A signed-out visitor sees
 * only the name and the sign-in link, so the bar never points to a page that
 * would refuse them.
 */

import { TreeDeciduous } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/session";

export async function SiteHeader() {
    const t = await getTranslations();
    const user = await getCurrentUser();

    return (
        <header className="sticky top-0 z-20 border-base-300 border-b bg-base-100/85 backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
                <Link
                    href="/"
                    className="group flex items-center gap-2.5 rounded-field px-1 py-1 font-semibold font-serif text-lg leading-none"
                >
                    <TreeDeciduous className="size-5 text-primary transition-transform group-hover:-rotate-6" />
                    {t("app.title")}
                </Link>

                {user && (
                    <nav className="ml-2 flex items-center gap-1">
                        <Link href="/trees" className="btn btn-ghost btn-sm">
                            {t("tree.many")}
                        </Link>
                    </nav>
                )}

                <div className="ml-auto flex items-center gap-1">
                    {user ? (
                        <SignOutButton />
                    ) : (
                        <Link href="/sign-in" className="btn btn-ghost btn-sm">
                            {t("auth.signIn")}
                        </Link>
                    )}
                    <LocaleSwitcher />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
