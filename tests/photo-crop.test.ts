/**
 * Familee - the part of a photograph that a card shows
 *
 * A crop is four fractions of the picture. The card is a square, so the height of a square crop is
 * its width divided by the picture's ratio (height over width), and the style that shows it uses
 * the units of the container, so a card and the editor's preview place the picture the same way.
 * Nothing here touches React or the database.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { cropHeight, cropStyle, defaultCrop, maxCropWidth } from "@/lib/photo-crop";

/** The fractions are worked out in floating point: compare them with a little room. */
function close(actual: number, expected: number) {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not close to ${expected}`);
}

test("a crop is never wider than the picture, nor taller than it", () => {
    // A wide picture (ratio above 1) is limited by its width, a tall one by its height.
    assert.equal(maxCropWidth(2), 1);
    assert.equal(maxCropWidth(1), 1);
    assert.equal(maxCropWidth(0.5), 0.5);
});

test("a square crop turns a width into a height", () => {
    assert.equal(cropHeight(1, 2), 0.5);
    assert.equal(cropHeight(0.5, 1), 0.5);
    assert.equal(cropHeight(0.4, 0.5), 0.8);
});

test("the default crop is centred and inside the picture", () => {
    const wide = defaultCrop(2);
    close(wide.w, 0.8);
    close(wide.h, 0.4);
    close(wide.x, 0.1);
    close(wide.y, 0.3);

    const tall = defaultCrop(0.5);
    close(tall.w, 0.4);
    close(tall.h, 0.8);
    close(tall.x, 0.3);
    close(tall.y, 0.1);

    for (const crop of [wide, tall, defaultCrop(1)]) {
        assert.ok(crop.x >= 0 && crop.y >= 0, "the crop starts outside the picture");
        assert.ok(crop.x + crop.w <= 1 && crop.y + crop.h <= 1, "the crop ends outside it");
    }
});

test("a square picture gets an even margin", () => {
    const crop = defaultCrop(1);
    close(crop.w, 0.8);
    close(crop.h, 0.8);
    close(crop.x, crop.y);
});

test("the style scales the picture so that the crop fills the container", () => {
    const style = cropStyle({ x: 0.1, y: 0.3, w: 0.8, h: 0.4 }, 2);
    const scale = "calc(100cqw / 0.8)";

    assert.equal(style?.width, scale);
    assert.equal(style?.height, "auto");
    assert.equal(style?.left, `calc(-0.1 * ${scale})`);
    assert.equal(style?.top, `calc(-0.3 * ${scale} * 2)`);
});

test("says nothing when there is no crop, or no picture to measure", () => {
    assert.equal(cropStyle(null, 2), undefined);
    assert.equal(cropStyle({ x: 0, y: 0, w: 1, h: 1 }, null), undefined);
});
