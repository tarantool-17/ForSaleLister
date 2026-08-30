import { createHash, randomBytes } from "node:crypto";
import { access, stat } from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 10;

export class ListingValidationError extends Error {
  constructor(issues) {
    super(issues.join("; "));
    this.name = "ListingValidationError";
    this.issues = issues;
  }
}

export function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

export function buildPublicMessage(listing) {
  const blocks = [
    `Состояние: ${normalizeWhitespace(listing.condition)}`,
    normalizeWhitespace(listing.description),
    `Получение товара: ${normalizeWhitespace(listing.fulfillment)}`,
  ];

  return blocks.filter(Boolean).join("\n\n");
}

export async function validateAndNormalizeListing(input) {
  const issues = [];
  const forumId = Number(input.category_forum_id);
  const price = Number(input.price);
  const photos = Array.isArray(input.photo_paths) ? input.photo_paths : [];

  if (!Number.isSafeInteger(forumId) || forumId <= 0) {
    issues.push("category_forum_id должен быть положительным целым числом");
  }
  if (!normalizeWhitespace(input.category_name)) {
    issues.push("category_name обязателен для проверки выбранной категории");
  }
  if (!normalizeWhitespace(input.title)) {
    issues.push("title обязателен");
  }
  if (!normalizeWhitespace(input.condition)) {
    issues.push("condition обязателен");
  }
  if (!normalizeWhitespace(input.description)) {
    issues.push("description обязателен");
  }
  if (!normalizeWhitespace(input.fulfillment)) {
    issues.push("fulfillment обязателен");
  }
  if (!Number.isFinite(price) || price <= 0) {
    issues.push("price должен быть положительным числом");
  }
  if (!new Set(["BYN", "USD", "EUR"]).has(input.currency)) {
    issues.push("currency должен быть BYN, USD или EUR");
  }
  if (!normalizeWhitespace(input.region_id)) {
    issues.push("region_id обязателен");
  }
  if (!normalizeWhitespace(input.region_name)) {
    issues.push("region_name обязателен для проверки региона");
  }
  if (photos.length === 0 || photos.length > MAX_PHOTOS) {
    issues.push(`нужно указать от 1 до ${MAX_PHOTOS} фотографий`);
  }

  const normalizedPhotos = [];
  for (const rawPhotoPath of photos) {
    const photoPath = path.resolve(String(rawPhotoPath));
    const extension = path.extname(photoPath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      issues.push(`неподдерживаемый формат фото: ${photoPath}`);
      continue;
    }
    try {
      await access(photoPath);
      const metadata = await stat(photoPath);
      if (!metadata.isFile()) {
        issues.push(`путь фото не является файлом: ${photoPath}`);
      } else if (metadata.size > MAX_IMAGE_BYTES) {
        issues.push(`фото превышает лимит 10 МБ: ${photoPath}`);
      } else {
        normalizedPhotos.push(photoPath);
      }
    } catch {
      issues.push(`фото недоступно: ${photoPath}`);
    }
  }

  if (issues.length) {
    throw new ListingValidationError(issues);
  }

  const listing = {
    category_forum_id: forumId,
    category_name: normalizeWhitespace(input.category_name),
    title: normalizeWhitespace(input.title),
    short_description: normalizeWhitespace(input.short_description),
    condition: normalizeWhitespace(input.condition),
    description: normalizeWhitespace(input.description),
    public_message: "",
    price: price.toFixed(2),
    currency: input.currency,
    negotiable: Boolean(input.negotiable),
    region_id: normalizeWhitespace(input.region_id),
    region_name: normalizeWhitespace(input.region_name),
    fulfillment: normalizeWhitespace(input.fulfillment),
    photo_paths: normalizedPhotos,
    strong_identifiers: [...new Set((input.strong_identifiers ?? [])
      .map(normalizeWhitespace)
      .filter(Boolean))],
  };
  listing.public_message = buildPublicMessage(listing);
  return listing;
}

export function listingDigest(listing) {
  return createHash("sha256")
    .update(JSON.stringify(listing))
    .digest("hex");
}

export function createApprovalId(listing) {
  return `onliner_${listingDigest(listing).slice(0, 16)}_${randomBytes(6).toString("hex")}`;
}

export function publicListingSummary(listing) {
  return {
    category: {
      forum_id: listing.category_forum_id,
      name: listing.category_name,
    },
    title: listing.title,
    short_description: listing.short_description,
    condition: listing.condition,
    description: listing.public_message,
    price: listing.price,
    currency: listing.currency,
    negotiable: listing.negotiable,
    region: {
      id: listing.region_id,
      name: listing.region_name,
    },
    fulfillment: listing.fulfillment,
    photos: listing.photo_paths.map((photoPath) => path.basename(photoPath)),
    strong_identifiers: listing.strong_identifiers,
  };
}
