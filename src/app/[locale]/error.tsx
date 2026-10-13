"use client";

/**
 * Familee - the screen for an unexpected error inside a locale
 *
 * The error text is not shown to the user: it may contain table names and
 * people's data. The details stay in the server logs.
 */

import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function LocaleError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations("errors");

    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col items-start gap-4 py-12">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-base-content/70 text-sm">{t("generic")}</p>
            {error.digest && (
                <p className="text-base-content/40 font-mono text-xs">{error.digest}</p>
            )}
            <button type="button" onClick={reset} className="btn btn-primary btn-sm mt-2">
                {t("retry")}
            </button>
        </div>
    );
}
