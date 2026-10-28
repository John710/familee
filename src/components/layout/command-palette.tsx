"use client";

/**
 * Familee - the window that opens on Ctrl+K: find one's way and search the archive
 *
 * It is mounted once, beside the top bar, so the shortcut works on every page. Which tree the reader
 * is inside is read from the address, so nothing has to be passed down: inside a tree the window
 * lists the pages of that tree and searches it, and between trees it looks up the reader's people
 * and trees. The pages are filtered by the reader's role on the server, never here.
 *
 * The keyboard is the point: Ctrl+K (or Cmd+K) opens it, the arrows move, Enter opens, Escape
 * closes. The Tab key stays inside (useFocusTrap), and the number of results is read out loud.
 */

import { Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { type PaletteResult, searchPaletteAction } from "@/lib/actions/palette";
import { formatDay } from "@/lib/day";
import { useEscapeLayer, useFocusTrap } from "@/lib/focus-trap";
import {
    clampSelection,
    isPaletteShortcut,
    moveSelection,
    selectedItem,
    treeSlugOf,
} from "@/lib/palette";

/** Sent on the window by the button in the top bar; the window listens for it. */
export const OPEN_PALETTE_EVENT = "familee:open-palette";

/** A day written as a photograph date, as "2007-04-21", reads as "21 April 2007". */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Item = {
    key: string;
    group: string;
    label: string;
    detail: string;
    href: string;
};

export function CommandPalette() {
    const t = useTranslations("palette");
    const tr = useTranslations();
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<PaletteResult | null>(null);
    const [pending, setPending] = useState(false);
    const [index, setIndex] = useState(0);

    const boxRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const latest = useRef(0);
    const slug = treeSlugOf(pathname);

    useFocusTrap(boxRef, open);

    // Ctrl+K and Cmd+K open and close the window from anywhere, on every layout of the keyboard; a
    // button in the top bar sends an event instead.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!isPaletteShortcut(event)) return;
            event.preventDefault();
            setOpen((value) => !value);
        };
        const onOpen = () => setOpen(true);
        window.addEventListener("keydown", onKey);
        window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
        };
    }, []);

    // Going to another page closes the window.
    // biome-ignore lint/correctness/useExhaustiveDependencies: a change of page is what closes it
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    // Opening starts from an empty query, with the cursor in the field.
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setIndex(0);
        inputRef.current?.focus();
    }, [open]);

    // Escape closes wherever the focus is inside the window - on the field or on a result - and
    // only this window when it lies over another one (a lightbox).
    useEscapeLayer(open, () => setOpen(false));

    // The search runs a quarter of a second after the last keystroke. Only the answer to the last
    // request is kept, so a slow one cannot overwrite a newer list.
    useEffect(() => {
        if (!open) return;
        const id = ++latest.current;
        setPending(true);
        const timer = setTimeout(
            async () => {
                const answer = await searchPaletteAction({ slug, query });
                if (id !== latest.current) return;
                setPending(false);
                setResult(answer);
                setIndex(0);
            },
            query.trim() === "" ? 0 : 250,
        );
        return () => clearTimeout(timer);
    }, [open, query, slug]);

    const trimmed = query.trim().toLowerCase();

    // The pages whose name matches what has been typed, then what the search found.
    const items: Item[] = (result?.ok ? result.commands : [])
        .filter(
            (command) =>
                trimmed === "" ||
                t(`commands.${command.key}` as "commands.people")
                    .toLowerCase()
                    .includes(trimmed),
        )
        .map((command) => ({
            key: `page-${command.key}`,
            group: t("pages"),
            label: t(`commands.${command.key}` as "commands.people"),
            detail: result?.ok ? (result.treeTitle ?? "") : "",
            href: command.href,
        }));

    for (const hit of result?.ok ? result.hits : []) {
        const day =
            hit.kind === "photo" && DAY.test(hit.detail) ? formatDay(hit.detail, locale) : "";
        items.push({
            key: `${hit.kind}-${hit.id}`,
            group:
                hit.kind === "tree"
                    ? t("trees")
                    : tr(`search.kinds.${hit.kind}` as "search.kinds.person"),
            label:
                hit.kind === "event"
                    ? tr(`events.${hit.title}` as "events.birth")
                    : hit.title || (hit.kind === "photo" ? tr("media.one") : tr("common.unknown")),
            detail: [day || hit.detail, hit.treeTitle].filter(Boolean).join(" · "),
            href: hit.href,
        });
    }

    const selected = selectedItem(items, clampSelection(index, items.length));
    const nothingFound =
        result?.ok && trimmed !== "" && items.length === 0 && !pending && result.hits.length === 0;

    function go(href: string) {
        setOpen(false);
        router.push(href);
    }

    function onFieldKey(event: ReactKeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((value) => moveSelection(value, 1, items.length));
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((value) => moveSelection(value, -1, items.length));
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            const item = selectedItem(items, clampSelection(index, items.length));
            if (item) go(item.href);
        }
    }

    if (!open) return null;

    let group = "";

    // The window is drawn into <body>, not where it is mounted: the top bar carries
    // `backdrop-blur`, and a filter on an ancestor makes that ancestor the containing block of a
    // `position: fixed` child. Inside the bar the dark plate was a strip as tall as the bar itself
    // (105px instead of the screen), so a click beside the window landed on the page behind and
    // never reached the plate that closes it. Under <body> the window covers the screen again.
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]">
            {/* The dark background is a button, so a click on it closes the window from the keyboard too. */}
            <button
                type="button"
                tabIndex={-1}
                aria-label={tr("common.close")}
                className="absolute inset-0 cursor-default"
                onClick={() => setOpen(false)}
            />
            <div
                ref={boxRef}
                role="dialog"
                aria-modal="true"
                aria-label={t("title")}
                className="card card-border relative w-full max-w-lg gap-0 bg-base-100 p-0 shadow-xl"
            >
                <div className="flex items-center gap-3 border-base-300 border-b px-4 py-3">
                    <Search className="size-4 shrink-0 text-base-content/60" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onFieldKey}
                        placeholder={t("placeholder")}
                        aria-label={t("placeholder")}
                        autoComplete="off"
                        className="w-full bg-transparent outline-none"
                    />
                    {pending && (
                        <Loader2 className="size-4 shrink-0 animate-spin text-base-content/60" />
                    )}
                </div>

                <p role="status" className="sr-only">
                    {trimmed === ""
                        ? ""
                        : t("resultCount", { count: result?.ok ? result.hits.length : 0 })}
                </p>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                    {result && !result.ok && (
                        <p className="px-3 py-6 text-center text-base-content/60 text-sm">
                            {tr(result.error as "common.notFound")}
                        </p>
                    )}

                    {trimmed === "" && result?.ok && (
                        <p className="px-3 pt-2 pb-1 text-base-content/60 text-xs">{t("hint")}</p>
                    )}

                    {nothingFound && (
                        <p className="px-3 py-6 text-center text-base-content/60 text-sm">
                            {t("empty")}
                        </p>
                    )}

                    <ul className="flex flex-col">
                        {items.map((item) => {
                            const heading = item.group !== group ? item.group : null;
                            group = item.group;
                            const chosen = selected?.key === item.key;
                            return (
                                <li key={item.key}>
                                    {heading && (
                                        <p className="px-3 pt-3 pb-1 font-medium text-base-content/60 text-xs">
                                            {heading}
                                        </p>
                                    )}
                                    <Link
                                        href={item.href}
                                        onClick={() => setOpen(false)}
                                        onMouseEnter={() =>
                                            setIndex(items.findIndex((one) => one.key === item.key))
                                        }
                                        className={`flex flex-col gap-0.5 rounded-field px-3 py-2 ${
                                            chosen ? "bg-base-200" : ""
                                        }`}
                                    >
                                        <span className="truncate font-medium text-sm">
                                            {item.label}
                                        </span>
                                        {item.detail && (
                                            <span className="truncate text-base-content/60 text-xs">
                                                {item.detail}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>,
        document.body,
    );
}

/** The button in the top bar: it only tells the window to open. */
export function CommandPaletteButton() {
    const t = useTranslations("palette");
    const [hint, setHint] = useState("Ctrl K");

    // The key is named the way the keyboard of the reader names it; set after the first paint, so
    // the markup of the server and of the browser stay the same.
    useEffect(() => {
        if (/Mac|iPhone|iPad/.test(navigator.platform)) setHint("⌘K");
    }, []);

    return (
        <button
            type="button"
            className="btn btn-ghost btn-sm gap-2"
            aria-label={t("open")}
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        >
            <Search className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("openShort")}</span>
            <kbd className="hidden font-sans text-base-content/50 text-xs md:inline">{hint}</kbd>
        </button>
    );
}
