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
            className="btn btn-ghost btn-sm gap-2"
            onClick={onClick}
            disabled={pending}
        >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">{t("signOut")}</span>
        </button>
    );
}
