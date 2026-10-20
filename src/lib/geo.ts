/**
 * Familee - places on the map, and the road a life walked between them
 *
 * The places of a tree carry a latitude and a longitude (familee.places.latitude/longitude). This
 * module is the arithmetic around them: reading a coordinate a person typed, bounding the points
 * so the map can open on the right corner of the world, and measuring how far a life moved. The
 * drawing itself belongs to the browser (src/components/map/places-map.tsx).
 *
 * Pure: no database, no network, no map library. See tests/geo.test.ts.
 */

export type GeoPoint = { latitude: number; longitude: number };

/** Latitude runs from the South Pole (-90) to the North Pole (90). */
export function isValidLatitude(value: number): boolean {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

/** Longitude runs from the antimeridian west of Greenwich (-180) to its east (180). */
export function isValidLongitude(value: number): boolean {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * A coordinate as a person writes it: "54.1931", "54,1931" or "  54.1931  ". Anything else - an
 * empty field, a word, "abc" - is null, which the form turns into an empty coordinate.
 */
export function parseCoordinate(text: string | null | undefined): number | null {
    if (text === null || text === undefined) return null;
    const trimmed = text.trim().replace(",", ".");
    if (trimmed === "") return null;
    if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
}

export type BoundingBox = {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    centerLat: number;
    centerLng: number;
    /** A span to hand a map as its starting zoom: the wider side of the box. */
    span: number;
};

/**
 * The smallest box around the points, or null when there is not a single one. The centre and the
 * span let the map open on the right corner of the world even before the tiles arrive.
 */
export function boundingBox(points: GeoPoint[]): BoundingBox | null {
    const valid = points.filter(
        (point) => isValidLatitude(point.latitude) && isValidLongitude(point.longitude),
    );
    const first = valid[0];
    if (!first) return null;

    let minLat = first.latitude;
    let maxLat = first.latitude;
    let minLng = first.longitude;
    let maxLng = first.longitude;
    for (const point of valid) {
        minLat = Math.min(minLat, point.latitude);
        maxLat = Math.max(maxLat, point.latitude);
        minLng = Math.min(minLng, point.longitude);
        maxLng = Math.max(maxLng, point.longitude);
    }

    return {
        minLat,
        maxLat,
        minLng,
        maxLng,
        centerLat: (minLat + maxLat) / 2,
        centerLng: (minLng + maxLng) / 2,
        span: Math.max(maxLat - minLat, maxLng - minLng),
    };
}

const EARTH_RADIUS_KM = 6371;

/**
 * The distance along the surface between two points, in kilometres (the haversine formula). Good
 * enough for "how far did this family move" and never used for anything precise.
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
    const toRad = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The whole road between the points, one leg after another; zero for fewer than two points. */
export function routeLengthKm(points: GeoPoint[]): number {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        if (previous && current) total += distanceKm(previous, current);
    }
    return total;
}
