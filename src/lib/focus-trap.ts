"use client";

/**
 * Familee - keeping the keyboard inside a window that lies over the page
 *
 * A dialog is modal, but the page behind it is still in the document: a Tab key pressed at the last
 * button of the dialog would move the focus to a link of the page the reader cannot see, and the
 * "Enter" after it would act on the page instead of on the dialog. The hook listens for Tab while
 * the window is open and turns the focus round - past the last control back to the first, and past
 * the first back to the last. Escape is left to the dialog, which knows what closing means.
 *
 * The caller keeps the ref of the box that holds the controls (not of the dimmed background).
 */

import { type RefObject, useEffect } from "react";

/** What can take the focus in a dialog; a disabled control and a `tabindex="-1"` cannot. */
const FOCUSABLE = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean): void {
    useEffect(() => {
        if (!open) return;

        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;

            const root = ref.current;
            if (!root) return;

            const focusable = root.querySelectorAll<HTMLElement>(FOCUSABLE);
            const first = focusable.item(0);
            const last = focusable.item(focusable.length - 1);
            if (!first || !last) return;

            const active = document.activeElement;
            const inside = root.contains(active);
            if (event.shiftKey && (active === first || !inside)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || !inside)) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [ref, open]);
}
