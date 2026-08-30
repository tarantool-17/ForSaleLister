const WORD_RE = /[\p{L}\p{N}]+/gu;

const CATEGORY_HINTS = new Map([
  ["кофемашина", "мелкая кухонная техника"],
  ["кофеварка", "мелкая кухонная техника"],
  ["кофемолка", "мелкая кухонная техника"],
  ["блендер", "мелкая кухонная техника"],
  ["мультиварка", "мелкая кухонная техника"],
  ["чайник", "мелкая кухонная техника"],
  ["тостер", "мелкая кухонная техника"],
  ["холодильник", "крупногабаритная и встраиваемая бытовая техника"],
  ["стиральная", "крупногабаритная и встраиваемая бытовая техника"],
  ["посудомоечная", "крупногабаритная и встраиваемая бытовая техника"],
  ["пылесос", "техника для уборки"],
  ["смартфон", "мобильные телефоны"],
  ["телефон", "мобильные телефоны"],
  ["ноутбук", "ноутбуки"],
  ["монитор", "мониторы проекторы"],
  ["телевизор", "телевизоры"],
  ["велосипед", "велосипеды"],
]);

export function normalizeForSearch(value) {
  return (String(value ?? "").toLocaleLowerCase("ru-RU").match(WORD_RE) ?? []).join(" ");
}

function tokens(value) {
  return new Set(normalizeForSearch(value).split(" ").filter((token) => token.length > 1));
}

function inferredHint(query) {
  const normalized = normalizeForSearch(query);
  for (const [keyword, hint] of CATEGORY_HINTS) {
    if (normalized.includes(keyword)) return hint;
  }
  return "";
}

export function rankCategories(categories, query, explicitHint = "", limit = 12) {
  const normalizedQuery = normalizeForSearch(query);
  const normalizedHint = normalizeForSearch(explicitHint || inferredHint(query));
  const queryTokens = tokens(`${normalizedQuery} ${normalizedHint}`);

  return categories
    .map((category) => {
      const haystack = normalizeForSearch(`${category.section ?? ""} ${category.name}`);
      const haystackTokens = tokens(haystack);
      let score = 0;
      for (const token of queryTokens) {
        if (haystackTokens.has(token)) score += 4;
        else if (haystack.includes(token) || token.includes(haystack)) score += 1;
      }
      if (normalizedHint && haystack.includes(normalizedHint)) score += 30;
      if (normalizedQuery && haystack.includes(normalizedQuery)) score += 20;
      return { ...category, score };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ru"))
    .slice(0, Math.max(1, Math.min(Number(limit) || 12, 50)));
}
