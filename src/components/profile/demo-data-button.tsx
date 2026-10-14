"use client";

/**
 * Familee - the administrator's button that creates the demo tree.
 *
 * The archive's own confirmation dialog warns first: the demo tree is replaced, and anything that
 * is in it is lost. The server checks the administrator's role again and runs the seed.
 */

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { createDemoTreeAction } from "@/lib/actions/demo";

export function DemoDataButton() {
    const t = useTranslations();
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    function onConfirm() {
        setAsking(false);
        setMessage(null);
        startTransition(async () => {
            const result = await createDemoTreeAction();
            if (!result.ok) {
                setMessage({ ok: false, text: t(result.error as Parameters<typeof t>[0]) });
                return;
            }
            setMessage({ ok: true, text: t("profile.demo.done") });
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-3">
            <button
                type="button"
                className="btn btn-outline btn-sm w-fit"
                disabled={pending}
                onClick={() => setAsking(true)}
            >
                {t("profile.demo.button")}
            </button>
            {message && (
                <p
                    role="status"
                    className={message.ok ? "text-sm text-success" : "text-error text-sm"}
                >
                    {message.text}
                </p>
            )}
            <ConfirmDialog
                open={asking}
                title={t("profile.demo.title")}
                message={t("profile.demo.warning")}
                confirmLabel={t("profile.demo.button")}
                danger
                onConfirm={onConfirm}
                onCancel={() => setAsking(false)}
            />
        </div>
    );
}
