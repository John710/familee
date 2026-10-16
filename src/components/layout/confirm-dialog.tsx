"use client";

/**
 * Familee - a confirmation in the style of the archive, instead of the browser's own box.
 *
 * It opens over the page on a dimmed background. The cancel button has the focus, so an
 * Enter key press does not destroy anything by accident. Escape and a click on the
 * background cancel. The caller keeps the state: `open` says whether the dialog shows.
 */

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useFocusTrap } from "@/lib/focus-trap";

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    danger = false,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    /** Destructive actions get a red confirm button. */
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const t = useTranslations();
    const boxRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    // The latest handler is read through a ref, so the focus is set once when the dialog opens.
    const cancelLatest = useRef(onCancel);
    useEffect(() => {
        cancelLatest.current = onCancel;
    }, [onCancel]);

    useFocusTrap(boxRef, open);

    useEffect(() => {
        if (!open) return;
        cancelRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") cancelLatest.current();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="modal modal-open"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
        >
            <div ref={boxRef} className="modal-box max-w-md">
                <div className="flex items-start gap-3">
                    {danger && (
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-error/15 text-error">
                            <AlertTriangle className="size-5" />
                        </span>
                    )}
                    <div className="flex flex-col gap-2">
                        <h2 id="confirm-title" className="font-semibold text-lg">
                            {title}
                        </h2>
                        <p id="confirm-message" className="text-base-content/70 text-sm">
                            {message}
                        </p>
                    </div>
                </div>
                <div className="modal-action">
                    <button
                        ref={cancelRef}
                        type="button"
                        className="btn btn-ghost"
                        onClick={onCancel}
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="button"
                        className={danger ? "btn btn-error" : "btn btn-primary"}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
            <button
                type="button"
                tabIndex={-1}
                aria-label={t("common.cancel")}
                className="modal-backdrop bg-black/50"
                onClick={onCancel}
            />
        </div>
    );
}
