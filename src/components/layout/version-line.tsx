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
        <>
            <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noreferrer"
                className="link link-hover"
                title={t("githubTitle")}
            >
                {label}
            </a>
            {latest !== null && (
                <>
                    {" · "}
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
        </>
    );
}
