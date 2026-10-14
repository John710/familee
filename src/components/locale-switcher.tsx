"use client";

/**
 * Familee - switching the language
 *
 * The list of languages comes from src/i18n/routing.ts, so a new language
 * appears here by itself, without editing this file.
 *
 * A client dropdown rather than a native <details>: the menu closes when the page
 * changes, when the person clicks elsewhere, and on Escape.
 */

import { Check, Languages } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { localeCookieName, locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ labels }: { labels: Record<string, string> }) {
    const t = useTranslations("locale");
    const activeLocale = useLocale();
    const router = useRouter();
    const currentPath = usePathname();
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const rootRef = useRef<HTMLDivElement>(null);

    // biome-ignore lint/correctness/useExhaustiveDependencies: the menu closes on each pathname change; the body does not read it
    useEffect(() => {
        setOpen(false);
    }, [currentPath]);

    useEffect(() => {
        if (!open) return;
        function onPointer(event: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    function switchTo(locale: (typeof locales)[number]) {
        setOpen(false);
        if (locale === activeLocale) return;

        // The cookie is set here: the unprefixed address of the default language does not refresh it,
        // so without this a switch back to the default language would be sent back to the other one.
        document.cookie = `${localeCookieName}=${locale}; path=/; max-age=31536000; samesite=lax`;

        startTransition(() => {
            // currentPath is without the language prefix, the router adds it.
            router.replace(currentPath, { locale });
        });
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                className={cn("btn btn-ghost btn-sm gap-2", isPending && "pointer-events-none")}
                aria-label={t("label")}
                aria-expanded={open}
                title={t("label")}
                onClick={() => setOpen((value) => !value)}
            >
                <Languages className="size-4" />
                <span className="hidden font-medium text-xs uppercase tracking-wide sm:inline">
                    {activeLocale}
                </span>
            </button>

            {open && (
                <ul className="menu absolute right-0 z-30 mt-2 w-48 rounded-box bg-base-100 p-2 shadow-lg ring-1 ring-base-300">
                    {locales.map((locale) => (
                        <li key={locale}>
                            <button
                                type="button"
                                onClick={() => switchTo(locale)}
                                className="flex items-center justify-between gap-2"
                                aria-current={locale === activeLocale ? "true" : undefined}
                            >
                                {labels[locale] ?? locale}
                                {locale === activeLocale && <Check className="size-4" />}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
