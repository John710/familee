"use client";

/**
 * Familee - the buttons that take a tree out of the screen
 *
 * The picture is drawn on the server (src/lib/tree-image.ts) and arrives as one SVG; here it is
 * shown and saved. A PNG is made in the browser from that same SVG, so the file looks exactly like
 * what stands on the screen; printing is left to the browser, which can save a PDF.
 */

import { FileCode, FileImage, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { treeImageFileName } from "@/lib/tree-image";

type Props = {
    /** The picture, as the server drew it. */
    svg: string;
    width: number;
    height: number;
    /** The title of the tree: the name of the files. */
    title: string;
};

export function TreeExport({ svg, width, height, title }: Props) {
    const t = useTranslations();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const source = useMemo(
        () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        [svg],
    );

    function save(blob: Blob, name: string) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
    }

    function saveSvg() {
        save(
            new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
            treeImageFileName(title, "svg"),
        );
    }

    /** The SVG is drawn into a canvas and the canvas is saved: a picture that every viewer opens. */
    async function savePng() {
        setBusy(true);
        setFailed(false);
        try {
            const image = new Image();
            const drawn = new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error("the picture could not be read"));
            });
            image.src = source;
            await drawn;

            // Twice the size, so that the names read well; a very large tree is left at its own size.
            const scale = Math.min(2, 8000 / Math.max(width, height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("the browser has no canvas");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/png"),
            );
            if (!blob) throw new Error("the picture could not be saved");
            save(blob, treeImageFileName(title, "png"));
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 print:hidden">
                <button
                    type="button"
                    className="btn btn-outline btn-sm gap-2"
                    onClick={savePng}
                    disabled={busy}
                >
                    <FileImage className="size-4" aria-hidden="true" />
                    {busy ? t("tree.export.working") : t("tree.export.png")}
                </button>
                <button type="button" className="btn btn-outline btn-sm gap-2" onClick={saveSvg}>
                    <FileCode className="size-4" aria-hidden="true" />
                    {t("tree.export.svg")}
                </button>
                <button
                    type="button"
                    className="btn btn-outline btn-sm gap-2"
                    onClick={() => window.print()}
                >
                    <Printer className="size-4" aria-hidden="true" />
                    {t("tree.export.print")}
                </button>
            </div>

            <p role="status" className="text-error text-sm print:hidden">
                {failed ? t("tree.export.failed") : ""}
            </p>

            {/* biome-ignore lint/performance/noImgElement: the picture is an SVG drawn here, there is nothing for the server to size */}
            <img
                src={source}
                alt={title}
                width={width}
                height={height}
                className="tree-export-sheet mx-auto h-auto max-w-full rounded-box border border-base-300 bg-white p-2"
            />
        </div>
    );
}
