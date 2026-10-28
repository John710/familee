"use client";

/**
 * Familee - gives the calendar feed of a tree a new address.
 *
 * The address is the key to the feed: every member sees it, and a member who has been removed
 * keeps it. An administrator retires it here; the calendars that use the old address stop
 * updating, so the dialog says so before anything changes.
 */

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { rotateCalendarTokenAction } from "@/lib/actions/trees";

export function CalendarTokenButton({ slug }: { slug: string }) {
    const t = useTranslations();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function confirm() {
        setOpen(false);
        setError(null);
        startTransition(async () => {
            const result = await rotateCalendarTokenAction({ slug });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col items-start gap-1">
            <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen(true)}
                disabled={pending}
            >
                <RefreshCw className="size-4" aria-hidden="true" />
                {t("calendar.newAddress")}
            </button>

            {error && (
                <p role="alert" className="text-error text-xs">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={open}
                title={t("calendar.newAddressTitle")}
                message={t("calendar.newAddressConfirm")}
                confirmLabel={t("calendar.newAddress")}
                danger
                onConfirm={confirm}
                onCancel={() => setOpen(false)}
            />
        </div>
    );
}
