"use client";

/**
 * Familee - switching the language
 *
 * The list of languages comes from src/i18n/routing.ts, so a new language
 * appears here by itself, without editing this file.
 */

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
    const t = useTranslations("locale");
    const activeLocale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();

    function switchTo(locale: (typeof locales)[number]) {
        if (locale === activeLocale) return;

        startTransition(() => {
            // pathname here is without the language prefix, the router adds it.
            router.replace(pathname, { locale });
        });
    }

    return (
        <div className="dropdown dropdown-end">
            <div
                tabIndex={0}
                role="button"
                className={cn("btn btn-ghost btn-sm gap-2", isPending && "pointer-events-none")}
                aria-label={t("label")}
                title={t("label")}
            >
                <Languages className="size-4" />
                <span className="hidden text-xs font-medium tracking-wide uppercase sm:inline">
                    {activeLocale}
                </span>
            </div>

            <ul
                tabIndex={0}
                className="dropdown-content menu rounded-box bg-base-100 ring-base-300 z-30 mt-2 w-48 p-2 shadow-lg ring-1"
            >
                {locales.map((locale) => (
                    <li key={locale}>
                        <button
                            type="button"
                            onClick={() => switchTo(locale)}
                            className="flex items-center justify-between gap-2"
                            aria-current={locale === activeLocale ? "true" : undefined}
                        >
                            {localeLabels[locale]}
                            {locale === activeLocale && <Check className="size-4" />}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
