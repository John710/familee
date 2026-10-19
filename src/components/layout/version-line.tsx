"use client";

/**
 * Familee - the footer line: the version of this archive, and the release it is missing
 *
 * The version and the link to the project are there as soon as the page is; the news about a newer
 * release arrives from /api/version afterwards, so a page never waits on GitHub, and an archive
 * without internet shows its version and nothing else. Nothing is announced unless the check really
 * found a newer version ((src/lib/app-version.ts, isNewer)).
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { APP_VERSION, LATEST_RELEASE_URL, REPOSITORY_URL } from "@/lib/app-version";

/** What /api/version answers. */
type VersionAnswer = {
    current: string;
    latest: string | null;
    updateAvailable: boolean;
};

/**
 * The GitHub mark. lucide-react carries no brand icons any more, and the mark of the project the
 * link goes to is worth drawing here: it is what tells a reader where the number leads.
 */
function GithubMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

export function VersionLine() {
    const t = useTranslations("app");
    const [latest, setLatest] = useState<string | null>(null);

    /** One text node, so the line reads as one piece for a screen reader and in the html. */
    const label = `${t("name")} ${APP_VERSION}`;

    useEffect(() => {
        const controller = new AbortController();

        fetch("/api/version", { signal: controller.signal })
            .then((answer) => (answer.ok ? answer.json() : null))
            .then((answer: VersionAnswer | null) => {
                if (answer?.updateAvailable === true && typeof answer.latest === "string") {
                    setLatest(answer.latest);
                }
            })
            /** The archive may have no way out; the line simply stays as it is. */
            .catch(() => {});

        return () => controller.abort();
    }, []);

    return (
        <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5">
            <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                className="link link-hover inline-flex items-center gap-x-1"
                title={t("githubTitle")}
            >
                <GithubMark className="size-3.5" />
                {label}
            </a>
            {latest !== null && (
                <>
                    <span aria-hidden="true">·</span>
                    <a
                        href={LATEST_RELEASE_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="link link-hover font-medium text-warning"
                        title={t("githubTitle")}
                    >
                        {t("updateAvailable", { version: latest })}
                    </a>
                </>
            )}
        </span>
    );
}
