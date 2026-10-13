"use client";

/**
 * Familee - the logo of a tree: shows the current one and changes it.
 *
 * The picture is read in the browser and sent as a data URL; the server makes the
 * final 256 x 256 image. Removing the logo returns the default tree icon.
 */

import { ImagePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setTreeLogoAction } from "@/lib/actions/logo";

export function TreeLogoForm({ slug, logoData, title }: { slug: string; logoData: string | null; title: string }) {
    const t = useTranslations();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function send(dataUrl: string | null) {
        setError(null);
        startTransition(async () => {
            const result = await setTreeLogoAction({ slug, dataUrl });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            router.refresh();
        });
    }

    function onFile(file: File | undefined) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") send(reader.result);
        };
        reader.onerror = () => setError(t("logo.invalid"));
        reader.readAsDataURL(file);
    }

    return (
        <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-box bg-base-200">
                {logoData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoData} alt={title} className="size-full object-cover" />
                ) : (
                    <span className="text-base-content/40 text-xs">{t("tree.noLogo")}</span>
                )}
            </div>

            <label className="btn btn-sm cursor-pointer">
                <ImagePlus className="size-4" />
                {t("tree.changeLogo")}
                <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={pending}
                    onChange={(event) => {
                        onFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </label>

            {logoData && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => send(null)} disabled={pending}>
                    <Trash2 className="size-4" />
                    {t("tree.removeLogo")}
                </button>
            )}

            {error && (
                <p role="alert" className="w-full text-error text-sm">
                    {error}
                </p>
            )}
        </div>
    );
}
