/**
 * Familee - the top bar
 *
 * The name of the archive on the left, with the link to the trees beside it once the window is
 * wide enough for both: on a telephone the name itself leads to the list. On the right, the
 * search that opens the palette, the birthdays, the profile - an icon that opens a menu with the
 * profile page and the sign-out button - then the two switchers. A visitor who is not signed in
 * sees the sign-in link instead.
 */

import { TreeDeciduous } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BirthdayBell } from "@/components/layout/birthday-bell";
import { CommandPalette, CommandPaletteButton } from "@/components/layout/command-palette";
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
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3">
                <Link
                    href="/"
                    className="group flex min-w-0 items-center gap-2.5 rounded-field px-1 py-1 font-semibold font-serif text-lg leading-none"
                >
                    <TreeDeciduous className="size-5 shrink-0 text-primary transition-transform group-hover:-rotate-6" />
                    <span className="truncate">{t("app.title")}</span>
                </Link>

                {user && (
                    // On a telephone the name of the archive leads to the same list, so this link
                    // only appears when there is room beside it.
                    <nav className="ml-2 hidden items-center gap-1 sm:flex">
                        <Link href="/trees" className="btn btn-ghost btn-sm">
                            {t("tree.many")}
                        </Link>
                    </nav>
                )}

                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {user && <CommandPaletteButton />}
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

            {/* The window that opens on Ctrl+K, wherever the reader is. */}
            <CommandPalette />
        </header>
    );
}
