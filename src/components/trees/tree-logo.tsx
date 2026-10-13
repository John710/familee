/**
 * Familee - the logo of a tree, or the default tree icon when the tree has none.
 *
 * Used everywhere a tree is shown, so that a tree looks the same on every page.
 */

import { TreeDeciduous } from "lucide-react";

export function TreeLogo({
    logoData,
    title,
    size = "md",
}: {
    logoData: string | null;
    title: string;
    size?: "sm" | "md" | "lg";
}) {
    const box = size === "sm" ? "size-8" : size === "lg" ? "size-16" : "size-12";
    const icon = size === "sm" ? "size-4" : size === "lg" ? "size-8" : "size-6";

    return (
        <span
            className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-box bg-base-200`}
        >
            {logoData ? (
                // biome-ignore lint/performance/noImgElement: the logo is a data URL from the database, which the image optimizer cannot read
                <img src={logoData} alt={title} className="size-full object-cover" />
            ) : (
                <TreeDeciduous className={`${icon} text-primary`} aria-hidden="true" />
            )}
        </span>
    );
}
