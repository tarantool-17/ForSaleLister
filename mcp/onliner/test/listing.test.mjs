import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ListingValidationError,
  listingDigest,
  publicListingSummary,
  validateAndNormalizeListing,
} from "../src/listing.mjs";

function baseInput(photoPath) {
  return {
    category_forum_id: 1682,
    category_name: "Мелкая кухонная техника",
    title: "Кофемашина Test EGF03",
    short_description: "Кофемашина со встроенной кофемолкой",
    condition: "б/у, исправна",
    description: "Проверена перед продажей. Есть следы обычного использования.",
    price: 2000,
    currency: "BYN",
    negotiable: true,
    region_id: "1",
    region_name: "Минск",
    fulfillment: "самовывоз в Минске; доставка по согласованию",
    photo_paths: [photoPath],
    strong_identifiers: ["EGF03"],
  };
}

test("normalizes an exact public listing packet", async (context) => {
  const photoPath = path.join(os.tmpdir(), `onliner-listing-${process.pid}.jpg`);
  await writeFile(photoPath, "test image placeholder");
  context.after(async () => {
    const { unlink } = await import("node:fs/promises");
    await unlink(photoPath);
  });

  const listing = await validateAndNormalizeListing(baseInput(photoPath));
  assert.equal(listing.price, "2000.00");
  assert.match(listing.public_message, /^Состояние: б\/у, исправна/);
  assert.match(listing.public_message, /Получение товара: самовывоз/);
  assert.equal(listingDigest(listing).length, 64);
  assert.deepEqual(publicListingSummary(listing).photos, [path.basename(photoPath)]);
});

test("rejects missing or unsupported photos", async () => {
  const input = baseInput("/definitely/missing/photo.webp");
  await assert.rejects(
    () => validateAndNormalizeListing(input),
    (error) => error instanceof ListingValidationError && error.issues.length > 0,
  );
});
