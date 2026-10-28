"use client";

/**
 * Familee - keeping the keyboard inside a window that lies over the page
 *
 * A dialog is modal, but the page behind it is still in the document: a Tab key pressed at the last
 * button of the dialog would move the focus to a link of the page the reader cannot see, and the
 * "Enter" after it would act on the page instead of on the dialog. The hook listens for Tab while
 * the window is open and turns the focus round - past the last control back to the first, and past
 * the first back to the last. Escape is left to the dialog, which knows what closing means; the
 * dialog registers it with `useEscapeLayer`, so that with several layers open (a palette over a
 * lightbox) one press closes only the one on top.
 *
 * The caller keeps the ref of the box that holds the controls (not of the dimmed background).
 */

import { type RefObject, useEffect, useRef } from "react";

/**
 * The layers that listen for Escape, the one opened last at the end. A palette over a lightbox,
 * a confirmation over a dialog: one press must close only the layer on top, so each layer asks
 * the stack whether it is the top before it reacts.
 */
const escapeLayers: symbol[] = [];

/**
 * While `open`, Escape calls `onEscape` - but only when this is the topmost layer that registered.
 * The handler may change on every render; the layer keeps its place in the stack.
 */
export function useEscapeLayer(open: boolean, onEscape: () => void): void {
    const latest = useRef(onEscape);
    useEffect(() => {
        latest.current = onEscape;
    }, [onEscape]);

    useEffect(() => {
        if (!open) return;

        const layer = Symbol("escape-layer");
        escapeLayers.push(layer);

        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (escapeLayers[escapeLayers.length - 1] !== layer) return;
            latest.current();
        };

        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            const at = escapeLayers.indexOf(layer);
            if (at !== -1) escapeLayers.splice(at, 1);
        };
    }, [open]);
}

/**
 * What can take the focus in a dialog; a disabled control, an element without a tab index and a
 * `tabindex="-1"` cannot.
 */
const FOCUSABLE = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(", ");

function focusableIn(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.tabIndex >= 0,
    );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean): void {
    useEffect(() => {
        if (!open) return;

        // The window takes the focus when it opens, and gives it back to the control that opened
        // it when it closes: a keyboard user never lands at the top of the page after a dialog.
        const previous =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const root = ref.current;
        const first = root ? focusableIn(root)[0] : undefined;
        first?.focus();

        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;

            const box = ref.current;
            if (!box) return;

            const focusable = focusableIn(box);
            const firstControl = focusable[0];
            const lastControl = focusable[focusable.length - 1];
            if (!firstControl || !lastControl) return;

            const active = document.activeElement;
            const inside = box.contains(active);
            if (event.shiftKey && (active === firstControl || !inside)) {
                event.preventDefault();
                lastControl.focus();
            } else if (!event.shiftKey && (active === lastControl || !inside)) {
                event.preventDefault();
                firstControl.focus();
            }
        };

        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            previous?.focus();
        };
    }, [ref, open]);
}
