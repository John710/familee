/**
 * Familee - the map of the places of a tree
 *
 * Draws the places that have coordinates. A person can be chosen to draw the road of their life:
 * the located events in order, with the stops numbered and listed below with their dates, and the
 * length of the route. The tiles come from the server named by MAP_TILE_URL.
 */

import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { type MapStop, PlacesMap } from "@/components/map/places-map";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { formatDay } from "@/lib/day";
import { routeLengthKm } from "@/lib/geo";
import { listGeoPlaces, listJourneyPersons, listPersonJourney } from "@/lib/library";
import { requireUser } from "@/lib/session";
import { getTreeAccess } from "@/lib/tree-access";

type Params = { locale: string; slug: string };

/** The default tile server, and its manners: the archive names its own in the settings. */
const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_ATTRIBUTION = "© OpenStreetMap contributors";

/** The day of a stop, written as precisely as the record knows it. */
function dayLabel(date: string | null, precision: string | null, locale: string): string | null {
    if (!date) return null;
    if (precision === "year" || precision === "decade" || precision === "century") {
        return date.slice(0, 4);
    }
    if (precision === "month") return date.slice(0, 7);
    return formatDay(date, locale);
}

/**
 * The places of the tree on a map, and - when a person is chosen - the road their life walked,
 * from the first located event to the last. Everybody who may read the tree may read this.
 */
export default async function MapPage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<{ person?: string }>;
}) {
    const { locale, slug } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    const user = await requireUser(locale, `/trees/${slug}/map`);
    const access = await getTreeAccess(slug, user.id);
    if (!access) notFound();

    const t = await getTranslations();
    const places = await listGeoPlaces(access.treeId);
    const journeyPersons = await listJourneyPersons(access.treeId);

    const wanted = (await searchParams).person ?? "";
    const selected = journeyPersons.some((person) => person.personId === wanted) ? wanted : "";
    const stops = selected ? await listPersonJourney(access.treeId, selected) : [];

    const route: MapStop[] = stops.map((stop, index) => ({
        order: index + 1,
        placeName: stop.placeName,
        dateLabel: dayLabel(stop.dateStart, stop.datePrecision, locale),
        latitude: stop.latitude,
        longitude: stop.longitude,
    }));
    const distance = routeLengthKm(route);

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <Link href={`/trees/${slug}/members`} className="text-primary text-sm">
                    {access.title}
                </Link>
                <h1 className="font-semibold font-serif text-3xl">{t("map.title")}</h1>
                <p className="text-base-content/60 text-sm">{t("map.hint")}</p>
            </header>

            {places.length === 0 ? (
                <p className="text-base-content/60 text-sm">{t("map.noPlaces")}</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {journeyPersons.length > 0 && (
                        <form method="get" className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-xs">{t("map.choosePerson")}</span>
                                <select name="person" defaultValue={selected} className="select">
                                    <option value="">{t("map.allPlaces")}</option>
                                    {journeyPersons.map((person) => (
                                        <option key={person.personId} value={person.personId}>
                                            {person.name || t("common.unknown")}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button type="submit" className="btn btn-primary btn-sm">
                                {t("map.show")}
                            </button>
                        </form>
                    )}

                    <PlacesMap
                        tileUrl={process.env.MAP_TILE_URL || DEFAULT_TILE_URL}
                        attribution={process.env.MAP_ATTRIBUTION || DEFAULT_ATTRIBUTION}
                        label={t("map.region")}
                        places={places.map((place) => ({
                            id: place.id,
                            name: place.fullName || place.name,
                            kind: place.kind,
                            latitude: place.latitude,
                            longitude: place.longitude,
                        }))}
                        route={route}
                    />

                    {/* The markers are drawn on a canvas of tiles: without this list the places
                        exist only for the mouse. */}
                    <section className="flex flex-col gap-2" aria-labelledby="map-places">
                        <h2 id="map-places" className="font-semibold text-lg">
                            {t("map.placesList")}
                        </h2>
                        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {places.map((place) => (
                                <li key={place.id}>{place.fullName || place.name}</li>
                            ))}
                        </ul>
                    </section>

                    {selected && (
                        <section className="flex flex-col gap-2">
                            <h2 className="font-semibold text-lg">{t("map.route")}</h2>
                            {route.length === 0 ? (
                                <p className="text-base-content/60 text-sm">{t("map.noJourney")}</p>
                            ) : (
                                <>
                                    {route.length > 1 && (
                                        <p className="text-base-content/60 text-sm">
                                            {t("map.distance", { km: Math.round(distance) })}
                                        </p>
                                    )}
                                    <ol className="flex flex-col gap-1 text-sm">
                                        {route.map((stop) => (
                                            <li key={`${stop.order}-${stop.placeName}`}>
                                                <span className="text-base-content/60">
                                                    {stop.order}.
                                                </span>{" "}
                                                {stop.placeName}
                                                {stop.dateLabel ? ` · ${stop.dateLabel}` : ""}
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            )}
                        </section>
                    )}

                    {places.length > 0 && (
                        <p className="text-base-content/60 text-sm">
                            {t("map.placesCount", { count: places.length })}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
