"use client";

/**
 * Familee - the map of the places, and the road a life walked between them
 *
 * The tiles come from a tile server, which the archive names in its settings (MAP_TILE_URL); by
 * default they come from OpenStreetMap, so the browser asks that server for the corner of the world
 * on show. On a network without a way out the map still opens - the markers and the line are drawn
 * on an empty background - so the page never breaks, it only loses its streets.
 *
 * Leaflet is imported in the effect, never at the top: it touches `window`, so it must not be
 * loaded while the page is built on the server. The markers are circles and the stops are numbered
 * dots, both drawn by us: no image files, so nothing to go missing under a bundler.
 */

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPlace = {
    id: string;
    name: string;
    kind: string;
    latitude: number;
    longitude: number;
};

export type MapStop = {
    order: number;
    placeName: string;
    /** The day of the event, already written for the reader; null when it is unknown. */
    dateLabel: string | null;
    latitude: number;
    longitude: number;
};

export function PlacesMap({
    tileUrl,
    attribution,
    places,
    route,
}: {
    tileUrl: string;
    attribution: string;
    places: MapPlace[];
    /** The stops of one person's road, oldest first; empty when no person is chosen. */
    route: MapStop[];
}) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let map: import("leaflet").Map | null = null;
        let cancelled = false;

        void (async () => {
            // Leaflet is a CommonJS/UMD module: depending on how the bundler hands it over, the
            // namespace either carries `default` or is the module itself. Both are taken.
            const imported = (await import("leaflet")) as typeof import("leaflet") & {
                default?: typeof import("leaflet");
            };
            const L = imported.default ?? imported;
            if (cancelled || !containerRef.current) return;

            map = L.map(container, { scrollWheelZoom: true });
            L.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(map);

            const points: [number, number][] = [];
            for (const place of places) {
                const point: [number, number] = [place.latitude, place.longitude];
                points.push(point);
                const label = document.createElement("span");
                label.textContent = place.name;
                L.circleMarker(point, {
                    radius: 5,
                    weight: 1,
                    color: "#1d4ed8",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.8,
                })
                    .addTo(map)
                    .bindPopup(label);
            }

            if (route.length > 1) {
                const road: [number, number][] = route.map((stop) => [
                    stop.latitude,
                    stop.longitude,
                ]);
                L.polyline(road, { color: "#b45309", weight: 3, opacity: 0.8 }).addTo(map);
            }

            for (const stop of route) {
                const point: [number, number] = [stop.latitude, stop.longitude];
                points.push(point);
                const popup = document.createElement("div");
                const title = document.createElement("strong");
                title.textContent = stop.placeName;
                popup.append(title);
                if (stop.dateLabel) {
                    const day = document.createElement("div");
                    day.textContent = stop.dateLabel;
                    popup.append(day);
                }
                L.marker(point, {
                    icon: L.divIcon({
                        className: "familee-map-stop",
                        html: `<span>${stop.order}</span>`,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                    }),
                })
                    .addTo(map)
                    .bindPopup(popup);
            }

            if (points.length === 0) {
                map.setView([20, 0], 1);
            } else {
                map.fitBounds(points, { padding: [30, 30], maxZoom: 10 });
            }
        })();

        return () => {
            cancelled = true;
            if (map) map.remove();
        };
    }, [tileUrl, attribution, places, route]);

    return (
        <div
            ref={containerRef}
            className="h-[70dvh] w-full overflow-hidden rounded-box border border-base-300 bg-base-200"
        />
    );
}
