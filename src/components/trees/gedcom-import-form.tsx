"use client";

/**
 * Familee - importing a GEDCOM file into a tree, in two steps.
 *
 * "Проверить" reads the file and shows what would be added, with the warnings; only
 * after that "Импортировать" becomes active and writes it. The file never leaves the
 * browser except as the text sent to the server actions.
 */

import { Check, FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Link } from "@/i18n/navigation";
import { commitGedcomAction, previewGedcomAction } from "@/lib/actions/gedcom";
import type { CommitResult, PreviewResult } from "@/lib/actions/gedcom";

/**
 * The file as base64, byte for byte: the server decodes it by the character set in
 * the file itself (UTF-8, UNICODE, ANSI, ASCII), so the browser must not decode it.
 */
async function toBase64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

export function GedcomImportForm({ slug, personsHref }: { slug: string; personsHref: string }) {
    const t = useTranslations();
    const [text, setText] = useState<string | null>(null);
    const [fileName, setFileName] = useState("");
    const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }> | null>(null);
    const [done, setDone] = useState<Extract<CommitResult, { ok: true }> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    async function onFile(file: File | undefined) {
        setPreview(null);
        setDone(null);
        setError(null);
        if (!file) {
            setText(null);
            setFileName("");
            return;
        }
        setFileName(file.name);
        setText(await toBase64(file));
    }

    function onPreview() {
        if (text === null) return;
        setError(null);
        setDone(null);
        startTransition(async () => {
            const result = await previewGedcomAction({ slug, bytes: text });
            if (!result.ok) {
                setPreview(null);
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            setPreview(result);
        });
    }

    function onImport() {
        if (text === null) return;
        setError(null);
        startTransition(async () => {
            const result = await commitGedcomAction({ slug, bytes: text });
            if (!result.ok) {
                setError(t(result.error as Parameters<typeof t>[0]));
                return;
            }
            setDone(result);
            setPreview(null);
        });
    }

    return (
        <div className="flex flex-col gap-6">
            <label className="card card-border flex cursor-pointer flex-col items-start gap-3 bg-base-100 p-6">
                <span className="flex items-center gap-2 font-medium">
                    <FileUp className="size-5 text-primary" />
                    {fileName || t("gedcom.chooseFile")}
                </span>
                <span className="text-base-content/60 text-xs">{t("gedcom.importHint")}</span>
                <input
                    type="file"
                    accept=".ged,.gedcom,text/plain"
                    className="file-input"
                    onChange={(event) => onFile(event.target.files?.[0])}
                />
            </label>

            <div className="flex flex-wrap gap-3">
                <button type="button" className="btn" onClick={onPreview} disabled={text === null || pending}>
                    {t("gedcom.preview")}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onImport}
                    disabled={!preview || pending}
                >
                    {t("gedcom.import")}
                </button>
            </div>

            {preview && (
                <section className="card card-border bg-base-100">
                    <div className="card-body gap-3">
                        <h2 className="font-semibold">{t("gedcom.previewTitle")}</h2>
                        <p className="text-sm">
                            {t("gedcom.summary", {
                                persons: preview.persons,
                                families: preview.unions,
                                children: preview.children,
                            })}
                        </p>
                        <p className="text-base-content/60 text-xs">
                            {t("gedcom.versionFound", { version: preview.version })}
                        </p>
                        {preview.warnings.length > 0 && (
                            <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">{t("gedcom.warnings")}</span>
                                <ul className="max-h-64 overflow-y-auto text-xs">
                                    {preview.warnings.map((warning, index) => (
                                        <li key={`${warning.xref}-${index}`}>
                                            {warning.xref}: {warning.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {done && (
                <div role="status" className="alert alert-success flex-col items-start gap-2">
                    <p className="flex items-center gap-2 font-medium">
                        <Check className="size-4" />
                        {t("gedcom.done", {
                            persons: done.persons,
                            families: done.unions,
                            events: done.events,
                        })}
                    </p>
                    <Link href={personsHref} className="link">
                        {t("person.many")}
                    </Link>
                </div>
            )}

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}
        </div>
    );
}
