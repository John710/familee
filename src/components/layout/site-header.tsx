/**
 * Familee - the top bar
 *
 * For now it only holds the name of the archive and the two switchers: the
 * sections (tree, people, places, photographs) will appear together with
 * their own pages, so that the bar has no links leading nowhere.
 */

import { TreeDeciduous } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/i18n/navigation";

export async function SiteHeader() {
    const t = await getTranslations();

    return (
        <header className="bg-base-100/85 border-base-300 sticky top-0 z-20 border-b backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
                <Link
                    href="/"
                    className="group flex items-center gap-2.5 rounded-field px-1 py-1 font-serif text-lg leading-none font-semibold"
                >
                    <TreeDeciduous className="text-primary size-5 transition-transform group-hover:-rotate-6" />
                    {t("app.title")}
                </Link>

                <div className="ml-auto flex items-center gap-1">
                    <LocaleSwitcher />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
