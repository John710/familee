"use client";

/**
 * Familee - gives a member a password reset link.
 *
 * The link appears once, under the button. It is valid for an hour.
 */

import { Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { issueResetLinkAction } from "@/lib/actions/reset";

export function ResetLinkButton({ slug, email }: { slug: string; email: string }) {
    const t = useTranslations();
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [pending, startTransition] = useTransition();

    function onClick() {
        setError(null);
        setCopied(false);
        startTransition(async () => {
            const result = await issueResetLinkAction({ slug, email });
            if (!result.ok) {
                setUrl(null);
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            setUrl(result.url);
        });
    }

    async function copy(value: string) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
    }

    return (
        <div className="flex flex-col items-end gap-2">
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onClick}
                disabled={pending}
            >
                <KeyRound className="size-4" />
                {t("members.issueReset")}
            </button>

            {url && (
                <div className="flex w-full max-w-md flex-col gap-2 rounded-box border border-base-300 p-3 text-left">
                    <p className="text-xs">{t("members.resetLinkHint")}</p>
                    <div className="flex items-center gap-2">
                        <code className="input w-full overflow-x-auto font-mono text-xs">
                            {url}
                        </code>
                        <button type="button" className="btn btn-sm" onClick={() => copy(url)}>
                            <Copy className="size-4" />
                            {copied ? t("common.copied") : t("common.copy")}
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <p role="alert" className="text-error text-xs">
                    {error}
                </p>
            )}
        </div>
    );
}
