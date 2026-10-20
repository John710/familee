/**
 * Familee - the arithmetic of the map
 *
 * The places carry coordinates typed by hand, so reading them has to be forgiving but safe, and the
 * box, the centre and the distance have to be right before a single tile is drawn.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
    boundingBox,
    distanceKm,
    isValidLatitude,
    isValidLongitude,
    parseCoordinate,
    routeLengthKm,
} from "@/lib/geo";

test("reads a coordinate as it is typed, and refuses what is not one", () => {
    assert.equal(parseCoordinate("54.1931"), 54.1931);
    assert.equal(parseCoordinate("54,1931"), 54.1931);
    assert.equal(parseCoordinate("  -7.5  "), -7.5);
    assert.equal(parseCoordinate(""), null);
    assert.equal(parseCoordinate("   "), null);
    assert.equal(parseCoordinate("north"), null);
    assert.equal(parseCoordinate("1.2.3"), null);
    assert.equal(parseCoordinate(null), null);
});

test("knows the edges of the world", () => {
    assert.equal(isValidLatitude(90), true);
    assert.equal(isValidLatitude(-90), true);
    assert.equal(isValidLatitude(90.1), false);
    assert.equal(isValidLongitude(180), true);
    assert.equal(isValidLongitude(-180), true);
    assert.equal(isValidLongitude(180.5), false);
});

test("boxes the points and finds their middle", () => {
    const box = boundingBox([
        { latitude: 55.75, longitude: 37.62 },
        { latitude: 59.94, longitude: 30.31 },
    ]);
    assert.ok(box);
    assert.equal(box.minLat, 55.75);
    assert.equal(box.maxLat, 59.94);
    assert.equal(box.minLng, 30.31);
    assert.equal(box.maxLng, 37.62);
    assert.equal(box.centerLat, (55.75 + 59.94) / 2);
    assert.equal(box.centerLng, (30.31 + 37.62) / 2);
    // The span is the wider of the two sides: here the longitude side, 37.62 - 30.31.
    assert.equal(box.span, 37.62 - 30.31);
});

test("a box needs at least one usable point", () => {
    assert.equal(boundingBox([]), null);
    assert.equal(boundingBox([{ latitude: 999, longitude: 0 }]), null);
    assert.ok(boundingBox([{ latitude: 0, longitude: 0 }]));
});

test("measures a distance along the surface", () => {
    // Moscow to Saint Petersburg is about 635 km as the crow flies.
    const km = distanceKm(
        { latitude: 55.7558, longitude: 37.6173 },
        { latitude: 59.9343, longitude: 30.3351 },
    );
    assert.ok(km > 600 && km < 670, `expected about 635 km, got ${km}`);
});

test("the road between the points is the sum of its legs", () => {
    const points = [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
        { latitude: 0, longitude: 2 },
    ];
    const oneDegree = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    assert.ok(Math.abs(routeLengthKm(points) - 2 * oneDegree) < 0.001);
    assert.equal(routeLengthKm([{ latitude: 1, longitude: 1 }]), 0);
});
