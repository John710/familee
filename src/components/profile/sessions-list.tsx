"use client";

/**
 * Familee - the devices the person is signed in on, with the way to end each one.
 *
 * The dates arrive already formatted on the server (formatting them in the browser
 * breaks hydration). The current device is marked and cannot be ended here: that is
 * the sign-out in the header.
 */

import { LogOut, MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/lib/actions/sessions";

export type SignedInDevice = {
    id: string;
    device: string;
    startedOn: string;
    activeOn: string;
    current: boolean;
};

export function SessionsList({ devices }: { devices: SignedInDevice[] }) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function onRevoke(sessionId: string) {
        setError(null);
        startTransition(async () => {
            const result = await revokeSessionAction({ sessionId });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    function onRevokeOthers() {
        setError(null);
        startTransition(async () => {
            const result = await revokeOtherSessionsAction();
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    const others = devices.filter((device) => !device.current).length;

    return (
        <div className="flex flex-col gap-4">
            <ul className="flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-100">
                {devices.map((device) => (
                    <li
                        key={device.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                        <div className="flex min-w-0 items-start gap-3">
                            <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-base-content/60" />
                            <div className="flex min-w-0 flex-col">
                                <span className="truncate font-medium text-sm">
                                    {device.device || t("profile.unknownDevice")}
                                </span>
                                <span className="text-base-content/60 text-xs">
                                    {t("profile.sessionStarted", { date: device.startedOn })} ·{" "}
                                    {t("profile.sessionActive", { date: device.activeOn })}
                                </span>
                            </div>
                        </div>
                        {device.current ? (
                            <span className="badge badge-soft badge-success">
                                {t("profile.thisDevice")}
                            </span>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm text-error"
                                onClick={() => onRevoke(device.id)}
                                disabled={pending}
                            >
                                <LogOut className="size-4" />
                                {t("profile.endSession")}
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            {others > 0 && (
                <button
                    type="button"
                    className="btn btn-outline btn-sm self-start"
                    onClick={onRevokeOthers}
                    disabled={pending}
                >
                    {t("profile.endOtherSessions")}
                </button>
            )}

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}
        </div>
    );
}
