import assert from "node:assert/strict";
import test from "node:test";

import { rankCategories } from "../src/categories.mjs";

const categories = [
  { forum_id: 1682, name: "Мелкая кухонная техника", section: "Бытовая техника" },
  { forum_id: 1679, name: "Крупногабаритная и встраиваемая бытовая техника", section: "Бытовая техника" },
  { forum_id: 1054, name: "Мобильные телефоны", section: "Телефоны" },
];

test("maps a coffee machine to the live small-appliance category", () => {
  const [first] = rankCategories(categories, "Кофемашина Smeg EGF03", "", 3);
  assert.equal(first.forum_id, 1682);
  assert.ok(first.score > 0);
});

test("honors an explicit category wording hint", () => {
  const [first] = rankCategories(categories, "техника", "Мобильные телефоны", 3);
  assert.equal(first.forum_id, 1054);
});
