"use client";

/**
 * Familee - importing a GEDCOM file into a tree, in two steps.
 *
 * The "Check" button reads the file and shows what would be added, with the warnings; only
 * after that the "Import" button becomes active and writes it. The file never leaves the
 * browser except as the text sent to the server actions.
 */

import { Check, FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Link } from "@/i18n/navigation";
import type { CommitResult, PreviewResult } from "@/lib/actions/gedcom";
import { commitGedcomAction, previewGedcomAction } from "@/lib/actions/gedcom";
import { GEDCOM_MAX_BYTES } from "@/lib/gedcom-text";

type Fault = { xref: string; message: string };

/**
 * The key of the message for an action that threw instead of answering: the framework refuses a
 * body over its limit before the action runs, and a dropped connection throws as well. Neither
 * may fall through to the error page and lose the form.
 */
function thrownKey(error: unknown): "gedcom.tooLarge" | "errors.generic" {
    const message = error instanceof Error ? error.message : String(error);
    return /body|size|limit|too large|413/i.test(message) ? "gedcom.tooLarge" : "errors.generic";
}

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
    const [faults, setFaults] = useState<Fault[]>([]);
    const [pending, startTransition] = useTransition();

    function fail(key: string, details: Fault[] = []) {
        setError(t(key as Parameters<typeof t>[0]));
        setFaults(details);
    }

    async function onFile(file: File | undefined) {
        setPreview(null);
        setDone(null);
        setError(null);
        setFaults([]);
        if (!file) {
            setText(null);
            setFileName("");
            return;
        }
        setFileName(file.name);
        // A file over the limit is refused here: sending it would only make the server say no.
        if (file.size > GEDCOM_MAX_BYTES) {
            setText(null);
            fail("gedcom.tooLarge");
            return;
        }
        setText(await toBase64(file));
    }

    function onPreview() {
        if (text === null) return;
        setError(null);
        setFaults([]);
        setDone(null);
        startTransition(async () => {
            try {
                const result = await previewGedcomAction({ slug, bytes: text });
                if (!result.ok) {
                    setPreview(null);
                    fail(result.error, result.details);
                    return;
                }
                setPreview(result);
            } catch (thrown) {
                setPreview(null);
                fail(thrownKey(thrown));
            }
        });
    }

    function onImport() {
        if (text === null) return;
        setError(null);
        setFaults([]);
        startTransition(async () => {
            try {
                const result = await commitGedcomAction({ slug, bytes: text });
                if (!result.ok) {
                    fail(result.error, result.details);
                    return;
                }
                setDone(result);
                setPreview(null);
            } catch (thrown) {
                fail(thrownKey(thrown));
            }
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
                <button
                    type="button"
                    className="btn"
                    onClick={onPreview}
                    disabled={text === null || pending}
                >
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
                        <p className="text-sm">
                            {t("gedcom.joinSummary", {
                                created: preview.created,
                                joined: preview.joined,
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
                                        // biome-ignore lint/suspicious/noArrayIndexKey: the warnings of one preview are a fixed list, never reordered
                                        <li key={`${warning.xref}-${index}`}>
                                            {warning.xref}: {warning.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {preview.duplicates.length > 0 && (
                            <div className="flex flex-col gap-1">
                                <span className="font-medium text-sm">
                                    {t("gedcom.duplicates")}
                                </span>
                                <p className="text-base-content/60 text-xs">
                                    {t("gedcom.duplicatesHint", {
                                        count: preview.joined,
                                    })}
                                </p>
                                <ul className="max-h-64 overflow-y-auto text-xs">
                                    {preview.duplicates.map((duplicate) => (
                                        <li key={duplicate.xref}>
                                            {duplicate.name} — {duplicate.existing}
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
                    {done.joined > 0 && (
                        <p className="text-xs">{t("gedcom.doneJoined", { count: done.joined })}</p>
                    )}
                    <Link href={personsHref} className="link">
                        {t("person.many")}
                    </Link>
                </div>
            )}

            {error && (
                <div role="alert" className="flex flex-col gap-1 text-error text-sm">
                    <p>{error}</p>
                    {faults.length > 0 && (
                        <ul className="max-h-64 overflow-y-auto text-xs">
                            {faults.map((fault, index) => (
                                // biome-ignore lint/suspicious/noArrayIndexKey: the faults of one answer are a fixed list, never reordered
                                <li key={`${fault.xref}-${index}`}>
                                    {fault.xref}: {fault.message}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
