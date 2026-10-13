"use client";

/**
 * Familee - switching the language
 *
 * The list of languages comes from src/i18n/routing.ts, so a new language
 * appears here by itself, without editing this file.
 *
 * The dropdown is a native <details> element: the browser handles the keyboard
 * and the focus itself, so no tabIndex or ARIA role is needed on a plain div.
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

    function switchTo(locale: (typeof locales)[number], menu: HTMLDetailsElement) {
        menu.open = false;
        if (locale === activeLocale) return;

        startTransition(() => {
            // pathname here is without the language prefix, the router adds it.
            router.replace(pathname, { locale });
        });
    }

    return (
        <details className="dropdown dropdown-end">
            <summary
                className={cn("btn btn-ghost btn-sm gap-2", isPending && "pointer-events-none")}
                aria-label={t("label")}
                title={t("label")}
            >
                <Languages className="size-4" />
                <span className="hidden font-medium text-xs uppercase tracking-wide sm:inline">
                    {activeLocale}
                </span>
            </summary>

            <ul className="dropdown-content menu z-30 mt-2 w-48 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300">
                {locales.map((locale) => (
                    <li key={locale}>
                        <button
                            type="button"
                            onClick={(event) =>
                                switchTo(
                                    locale,
                                    event.currentTarget.closest("details") as HTMLDetailsElement,
                                )
                            }
                            className="flex items-center justify-between gap-2"
                            aria-current={locale === activeLocale ? "true" : undefined}
                        >
                            {localeLabels[locale]}
                            {locale === activeLocale && <Check className="size-4" />}
                        </button>
                    </li>
                ))}
            </ul>
        </details>
    );
}
