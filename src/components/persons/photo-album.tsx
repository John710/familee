"use client";

/**
 * Familee - the photograph album of a person
 *
 * Everybody in the tree sees the album; editors also upload - with the button or by dropping the
 * files onto the album - choose the main photograph (the one on the card in the tree), write a
 * caption under a picture, put the pictures in the order they want, say who is in a picture, and
 * take photographs off the person. Files go to the upload route one by one, so a large batch shows
 * its progress and one bad file does not stop the others. The server checks everything again. A
 * click on a picture opens the shared window (components/media/lightbox.tsx).
 */

import {
    ArrowDown,
    ArrowUp,
    CalendarDays,
    ImagePlus,
    Pencil,
    Star,
    Tags,
    Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type DragEvent, useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/layout/confirm-dialog";
import { Lightbox, photoUrl } from "@/components/media/lightbox";
import { MediaIcon } from "@/components/media/media-icon";
import { CropDialog } from "@/components/persons/crop-dialog";
import { useRouter } from "@/i18n/navigation";
import {
    movePhotoAction,
    removePersonPhotoAction,
    setMainPhotoAction,
    setPhotoCaptionAction,
    setPhotoDateAction,
    tagPhotoPeopleAction,
} from "@/lib/actions/photos";
import { formatDay } from "@/lib/day";
import { useFocusTrap } from "@/lib/focus-trap";
import type { PhotoCrop } from "@/lib/photo-crop";

export type AlbumPhoto = {
    mediaId: string;
    /** photo · document · audio · video · other. A photograph has a thumbnail; the rest a mark. */
    kind: string;
    /** The type the archive serves it as, for the window to choose a viewer. */
    mimeType: string;
    /** The name the file came from, shown for a document. */
    name: string | null;
    isPrimary: boolean;
    /** The part of the picture the card shows for this person; null for the whole picture. */
    crop: PhotoCrop | null;
    /** Height over width of the picture; null when the size is not known. */
    ratio: number | null;
    /** What stands under the photograph in this album. */
    caption: string | null;
    /** The day the photograph was taken, as "2007-04-21"; null when it is not known. */
    date: string | null;
    /** Who is in the picture, by name, as the tree names them. */
    people: string[];
    /** The identifiers of those people, for the tagging window. */
    personIds: string[];
};

/** Photographs, documents, recordings and films: whatever a family keeps. */
const ACCEPT =
    "image/*,application/pdf,audio/*,video/*,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,.doc,.docx,.odt,.zip,.rar,.7z";

export function PhotoAlbum({
    slug,
    personId,
    photos,
    people,
    canEdit,
}: {
    slug: string;
    personId: string;
    photos: AlbumPhoto[];
    /** Everybody in the tree, for the tagging window. */
    people: { personId: string; name: string }[];
    canEdit: boolean;
}) {
    const t = useTranslations();
    const locale = useLocale();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [viewing, setViewing] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    /** The photograph waiting for the confirmation dialog, if any. */
    const [removing, setRemoving] = useState<string | null>(null);
    /** The main photograph whose crop is being chosen, if any. */
    const [cropping, setCropping] = useState<AlbumPhoto | null>(null);
    /** The photograph whose caption is being written, if any. */
    const [writing, setWriting] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    /** The photograph whose day is being written, if any. */
    const [dating, setDating] = useState<string | null>(null);
    const [dateDraft, setDateDraft] = useState("");
    /** The photograph whose people are being picked, if any. */
    const [tagging, setTagging] = useState<AlbumPhoto | null>(null);
    const [tagFilter, setTagFilter] = useState("");
    const [tagDraft, setTagDraft] = useState<string[]>([]);
    const tagBoxRef = useRef<HTMLDivElement>(null);
    const [pending, startTransition] = useTransition();

    // The list of people being tagged is a window over the album: keep the keyboard in it.
    useFocusTrap(tagBoxRef, tagging !== null);

    function translate(key: string, values?: Record<string, string | number>) {
        return t(key as Parameters<typeof t>[0], values);
    }

    async function uploadOne(file: File): Promise<string | null> {
        const body = new FormData();
        body.append("file", file);
        let response: Response;
        try {
            response = await fetch(`/api/trees/${slug}/persons/${personId}/photos`, {
                method: "POST",
                body,
            });
        } catch {
            // A dropped connection is a failure of this file, not of the whole batch.
            return translate("media.errors.failed", { limit: "" });
        }
        if (response.ok) return null;
        const data = (await response.json().catch(() => null)) as {
            error?: string;
            limit?: number;
        } | null;
        return translate(data?.error ?? "media.errors.failed", {
            limit: `${data?.limit ?? ""} MB`,
        });
    }

    async function onFiles(files: FileList | File[] | null) {
        if (!files || files.length === 0) return;
        setError(null);
        const list = Array.from(files);
        const failures: string[] = [];
        try {
            for (const [index, file] of list.entries()) {
                setProgress({ done: index, total: list.length });
                const problem = await uploadOne(file);
                if (problem) failures.push(`${file.name}: ${problem}`);
            }
        } finally {
            // Whatever happened above, the bar must not stay on screen.
            setProgress(null);
            if (failures.length > 0) setError(failures.join(" · "));
            router.refresh();
        }
    }

    function onDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setDragging(false);
        if (!canEdit) return;
        void onFiles(event.dataTransfer.files);
    }

    function onMain(mediaId: string) {
        setError(null);
        startTransition(async () => {
            const result = await setMainPhotoAction({ slug, personId, mediaId });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            router.refresh();
        });
    }

    function saveCaption(mediaId: string, current: string | null) {
        setWriting(null);
        const caption = draft.trim();
        if (caption === (current ?? "")) return;
        setError(null);
        startTransition(async () => {
            const result = await setPhotoCaptionAction({ slug, personId, mediaId, caption });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            router.refresh();
        });
    }

    /**
     * Saves the day of a photograph. The day belongs to the picture, not to this album, so the
     * correction shows on every card the picture is on; an empty field takes the day away again.
     */
    function saveDate(mediaId: string, current: string | null) {
        setDating(null);
        const date = dateDraft.trim() === "" ? null : dateDraft.trim();
        if (date === current) return;
        setError(null);
        startTransition(async () => {
            const result = await setPhotoDateAction({ slug, mediaId, date });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            router.refresh();
        });
    }

    function move(mediaId: string, delta: -1 | 1) {
        setError(null);
        startTransition(async () => {
            const result = await movePhotoAction({ slug, personId, mediaId, delta });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            router.refresh();
        });
    }

    function openTags(photo: AlbumPhoto) {
        setTagging(photo);
        setTagFilter("");
        setTagDraft(photo.personIds);
    }

    function saveTags() {
        const photo = tagging;
        setTagging(null);
        if (!photo) return;
        setError(null);
        startTransition(async () => {
            const result = await tagPhotoPeopleAction({
                slug,
                mediaId: photo.mediaId,
                personIds: tagDraft,
            });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            router.refresh();
        });
    }

    function removeNow(mediaId: string) {
        setRemoving(null);
        setError(null);
        startTransition(async () => {
            const result = await removePersonPhotoAction({ slug, personId, mediaId });
            if (!result.ok) {
                setError(translate(result.error));
                return;
            }
            // The photograph may have been the one open in the window.
            setViewing(null);
            router.refresh();
        });
    }

    const filter = tagFilter.trim().toLowerCase();
    const shown = people.filter((person) => person.name.toLowerCase().includes(filter));

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: dropping files is an addition to the upload button below, which does the same work from the keyboard
        <div
            className={`flex flex-col gap-4 rounded-box border-2 border-dashed p-2 ${
                dragging ? "border-primary bg-primary/5" : "border-transparent"
            }`}
            onDragOver={(event) => {
                if (!canEdit) return;
                event.preventDefault();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
        >
            <p className="text-base-content/60 text-sm">{t("media.hint")}</p>
            {dragging && canEdit && <p className="text-primary text-sm">{t("media.dropHint")}</p>}

            {photos.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("media.empty")}</p>
            ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {photos.map((photo, index) => (
                        <li
                            key={photo.mediaId}
                            className="card card-border overflow-hidden bg-base-100"
                        >
                            <button
                                type="button"
                                onClick={() => setViewing(index)}
                                aria-label={
                                    photo.kind === "photo"
                                        ? (photo.caption ??
                                          (photo.date
                                              ? formatDay(photo.date, locale)
                                              : t("media.one")))
                                        : (photo.name ?? t("media.file"))
                                }
                                className="relative block aspect-square w-full overflow-hidden bg-base-200"
                            >
                                {photo.kind === "photo" ? (
                                    /* biome-ignore lint/performance/noImgElement: the picture is served by our own route, already sized as a thumbnail */
                                    <img
                                        src={photoUrl(slug, photo.mediaId, "thumb")}
                                        alt=""
                                        loading="lazy"
                                        className="size-full object-cover"
                                    />
                                ) : (
                                    <span className="flex size-full flex-col items-center justify-center gap-2 p-3 text-base-content/60">
                                        <MediaIcon kind={photo.kind} className="size-10" />
                                        <span className="line-clamp-2 break-all text-center text-xs">
                                            {photo.name ?? t("media.file")}
                                        </span>
                                    </span>
                                )}
                                {photo.isPrimary && photo.kind === "photo" && (
                                    <span className="badge badge-primary absolute top-2 left-2 gap-1">
                                        <Star className="size-3" />
                                        {t("media.portrait")}
                                    </span>
                                )}
                            </button>

                            {canEdit ? (
                                <div className="flex flex-col gap-1.5 p-2">
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center">
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-xs btn-square"
                                                aria-label={t("media.moveUp")}
                                                title={t("media.moveUp")}
                                                disabled={pending || index === 0}
                                                onClick={() => move(photo.mediaId, -1)}
                                            >
                                                <ArrowUp className="size-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-xs btn-square"
                                                aria-label={t("media.moveDown")}
                                                title={t("media.moveDown")}
                                                disabled={pending || index === photos.length - 1}
                                                onClick={() => move(photo.mediaId, 1)}
                                            >
                                                <ArrowDown className="size-3.5" />
                                            </button>
                                            {photo.kind === "photo" && (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-xs btn-square"
                                                    aria-label={t("media.tagPerson")}
                                                    title={t("media.tagPerson")}
                                                    disabled={pending}
                                                    onClick={() => openTags(photo)}
                                                >
                                                    <Tags className="size-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center">
                                            {photo.kind === "photo" &&
                                                (photo.isPrimary ? (
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-xs"
                                                        disabled={pending}
                                                        onClick={() => setCropping(photo)}
                                                    >
                                                        {t("media.crop")}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-xs"
                                                        disabled={pending}
                                                        onClick={() => onMain(photo.mediaId)}
                                                    >
                                                        {t("media.setPortrait")}
                                                    </button>
                                                ))}
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-xs btn-square text-error"
                                                aria-label={t("media.remove")}
                                                title={t("media.remove")}
                                                disabled={pending}
                                                onClick={() => setRemoving(photo.mediaId)}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {writing === photo.mediaId ? (
                                        <input
                                            // biome-ignore lint/a11y/noAutofocus: the field appears because the reader asked for it
                                            autoFocus
                                            className="input input-xs w-full"
                                            maxLength={500}
                                            placeholder={t("media.captionPlaceholder")}
                                            value={draft}
                                            onChange={(event) => setDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    saveCaption(photo.mediaId, photo.caption);
                                                }
                                                if (event.key === "Escape") setWriting(null);
                                            }}
                                            onBlur={() => saveCaption(photo.mediaId, photo.caption)}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="flex items-start gap-1 text-left text-base-content/70 text-xs hover:text-base-content"
                                            onClick={() => {
                                                setWriting(photo.mediaId);
                                                setDraft(photo.caption ?? "");
                                            }}
                                        >
                                            <Pencil className="mt-0.5 size-3 shrink-0" />
                                            <span className="line-clamp-2">
                                                {photo.caption || t("media.captionAdd")}
                                            </span>
                                        </button>
                                    )}

                                    {dating === photo.mediaId ? (
                                        <input
                                            // biome-ignore lint/a11y/noAutofocus: the field appears because the reader asked for it
                                            autoFocus
                                            type="date"
                                            className="input input-xs w-full"
                                            aria-label={t("media.dateLabel")}
                                            value={dateDraft}
                                            onChange={(event) => setDateDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") {
                                                    saveDate(photo.mediaId, photo.date);
                                                }
                                                if (event.key === "Escape") setDating(null);
                                            }}
                                            onBlur={() => saveDate(photo.mediaId, photo.date)}
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            className="flex items-center gap-1 text-left text-base-content/50 text-xs hover:text-base-content"
                                            onClick={() => {
                                                setDating(photo.mediaId);
                                                setDateDraft(photo.date ?? "");
                                            }}
                                        >
                                            <CalendarDays className="size-3 shrink-0" />
                                            <span>
                                                {photo.date
                                                    ? formatDay(photo.date, locale)
                                                    : t("media.dateAdd")}
                                            </span>
                                        </button>
                                    )}

                                    {photo.people.length > 0 && (
                                        <span className="text-base-content/50 text-xs">
                                            {photo.people.join(", ")}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                (photo.caption || photo.date || photo.people.length > 0) && (
                                    <div className="flex flex-col gap-0.5 p-2 text-xs">
                                        {photo.caption && (
                                            <span className="text-base-content/70">
                                                {photo.caption}
                                            </span>
                                        )}
                                        {photo.date && (
                                            <span className="text-base-content/50">
                                                {formatDay(photo.date, locale)}
                                            </span>
                                        )}
                                        {photo.people.length > 0 && (
                                            <span className="text-base-content/50">
                                                {photo.people.join(", ")}
                                            </span>
                                        )}
                                    </div>
                                )
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canEdit && (
                <label className="btn btn-primary btn-sm w-fit cursor-pointer">
                    <ImagePlus className="size-4" />
                    {progress
                        ? t("media.uploading", { done: progress.done + 1, total: progress.total })
                        : t("media.upload")}
                    <input
                        type="file"
                        accept={ACCEPT}
                        multiple
                        className="hidden"
                        disabled={progress !== null}
                        onChange={(event) => {
                            void onFiles(event.target.files);
                            event.target.value = "";
                        }}
                    />
                </label>
            )}

            {error && (
                <p role="alert" className="text-error text-sm">
                    {error}
                </p>
            )}

            <ConfirmDialog
                open={removing !== null}
                title={t("media.removeTitle")}
                message={t("media.removeConfirm")}
                confirmLabel={t("common.remove")}
                danger
                onConfirm={() => {
                    if (removing) removeNow(removing);
                }}
                onCancel={() => setRemoving(null)}
            />

            {cropping && cropping.ratio !== null && (
                <CropDialog
                    slug={slug}
                    personId={personId}
                    mediaId={cropping.mediaId}
                    ratio={cropping.ratio}
                    crop={cropping.crop}
                    onClose={() => setCropping(null)}
                />
            )}

            {tagging && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t("media.tagPerson")}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                >
                    <div ref={tagBoxRef} className="card w-full max-w-md bg-base-100">
                        <div className="card-body gap-3">
                            <h2 className="font-semibold">{t("media.peopleOnPhoto")}</h2>
                            <input
                                className="input input-sm"
                                placeholder={t("media.tagFilter")}
                                value={tagFilter}
                                onChange={(event) => setTagFilter(event.target.value)}
                            />
                            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                                {shown.map((person) => (
                                    <li key={person.personId}>
                                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                className="checkbox checkbox-sm"
                                                checked={tagDraft.includes(person.personId)}
                                                onChange={(event) =>
                                                    setTagDraft((current) =>
                                                        event.target.checked
                                                            ? [...current, person.personId]
                                                            : current.filter(
                                                                  (id) => id !== person.personId,
                                                              ),
                                                    )
                                                }
                                            />
                                            {person.name || t("common.unknown")}
                                        </label>
                                    </li>
                                ))}
                                {shown.length === 0 && (
                                    <li className="text-base-content/60 text-sm">
                                        {t("common.empty")}
                                    </li>
                                )}
                            </ul>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setTagging(null)}
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={pending}
                                    onClick={saveTags}
                                >
                                    {t("common.save")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewing !== null && photos[viewing] && (
                <Lightbox
                    slug={slug}
                    photos={photos.map((photo) => ({
                        mediaId: photo.mediaId,
                        kind: photo.kind,
                        mimeType: photo.mimeType,
                        name: photo.name,
                        caption: photo.caption,
                        tagged: photo.people,
                        date: photo.date,
                    }))}
                    index={viewing}
                    onIndex={setViewing}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
