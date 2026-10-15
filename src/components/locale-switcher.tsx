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
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { localeCookieName, locales } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** The part of the Cookie Store API used here: the browser type may be missing from the lib. */
type CookieStoreLike = {
    set: (init: {
        name: string;
        value: string;
        path?: string;
        maxAge?: number;
        sameSite?: "lax" | "strict" | "none";
    }) => Promise<void>;
};

/**
 * Remembers the chosen language. It must land before the navigation in switchTo, because the
 * unprefixed address of the default language does not refresh the cookie on its own.
 *
 * The Cookie Store API is used where the browser has it; the plain assignment is the fallback for
 * one without it (the linter prefers the API, hence the one ignore below).
 */
async function rememberLocale(locale: string) {
    const store = (globalThis as { cookieStore?: CookieStoreLike }).cookieStore;
    if (store) {
        await store.set({
            name: localeCookieName,
            value: locale,
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
            sameSite: "lax",
        });
        return;
    }

    // biome-ignore lint/suspicious/noDocumentCookie: the fallback for a browser without the Cookie Store API
    document.cookie = `${localeCookieName}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

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

    async function switchTo(locale: (typeof locales)[number]) {
        setOpen(false);
        if (locale === activeLocale) return;

        // The cookie has to land before the navigation below: the unprefixed address of the
        // default language does not refresh it, so without this a switch back to the default
        // language would be sent back to the other one.
        await rememberLocale(locale);

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
                                onClick={() => void switchTo(locale)}
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
