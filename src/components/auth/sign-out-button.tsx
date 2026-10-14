"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
    const t = useTranslations("auth");
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    function onClick() {
        startTransition(async () => {
            await authClient.signOut();
            router.replace("/sign-in");
            router.refresh();
        });
    }

    return (
        <button
            type="button"
            className="flex w-full items-center gap-3 rounded-field px-3 py-2 text-left text-sm transition-colors hover:bg-base-200 disabled:opacity-60"
            onClick={onClick}
            disabled={pending}
        >
            <LogOut className="size-4 text-base-content/60" aria-hidden="true" />
            {t("signOut")}
        </button>
    );
}
