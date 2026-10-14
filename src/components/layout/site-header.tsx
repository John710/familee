/**
 * Familee - the top bar
 *
 * The name of the archive and the link to the trees on the left. On the right, the
 * profile: an icon that opens a menu with the profile page and the sign-out button,
 * then the two switchers. A visitor who is not signed in sees the sign-in link instead.
 */

import { TreeDeciduous } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BirthdayBell } from "@/components/layout/birthday-bell";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { localeNames } from "@/i18n/locale-names";
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
                    {user && <BirthdayBell />}
                    {user ? (
                        <ProfileMenu
                            label={t("profile.title")}
                            title={user.name || user.email}
                            profileLabel={t("profile.title")}
                        />
                    ) : (
                        <Link href="/sign-in" className="btn btn-ghost btn-sm">
                            {t("auth.signIn")}
                        </Link>
                    )}
                    <LocaleSwitcher labels={await localeNames()} />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
