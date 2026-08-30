#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { OnlinerBrowser, PUBLISH_CONFIRMATION } from "./browser.mjs";
import {
  createApprovalId,
  ListingValidationError,
  listingDigest,
  publicListingSummary,
  validateAndNormalizeListing,
} from "./listing.mjs";
import { JsonStateStore } from "./store.mjs";

const store = new JsonStateStore();
const browser = new OnlinerBrowser({ stateStore: store });

const server = new McpServer(
  { name: "onliner-for-sale", version: "0.1.0" },
  {
    instructions:
      "Сначала вызовите onliner_auth_status, затем onliner_find_categories, onliner_find_regions и " +
      "onliner_preview_listing. " +
      "Покажите пользователю точное содержимое preview и получите явное согласие. Только после этого " +
      "вызывайте onliner_publish_listing с тем же approval_id. Не публикуйте повторно при статусе " +
      "«результат неизвестен» и не передавайте инструменту пароль, cookie, MFA-коды или CAPTCHA. " +
      "Остановитесь при проверке личности, оплате, юридическом подтверждении или возможном дубликате.",
  },
);

const listingSchema = {
  category_forum_id: z.number().int().positive().describe("Точный forum_id из onliner_find_categories"),
  category_name: z.string().min(1).describe("Точное живое название выбранной категории"),
  title: z.string().min(1).max(255),
  short_description: z.string().max(255).default(""),
  condition: z.string().min(1),
  description: z.string().min(1),
  price: z.number().positive(),
  currency: z.enum(["BYN", "USD", "EUR"]).default("BYN"),
  negotiable: z.boolean().default(false),
  region_id: z.string().min(1).describe("Значение региона из актуальной формы Onliner"),
  region_name: z.string().min(1).describe("Название региона для пользовательского preview"),
  fulfillment: z.string().min(1).describe("Самовывоз/доставка и кто оплачивает"),
  photo_paths: z.array(z.string().min(1)).min(1).max(10),
  strong_identifiers: z.array(z.string().min(1)).max(10).default([]),
};

function result(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError,
  };
}

function safeError(error) {
  if (error instanceof ListingValidationError) {
    return result({ status: "ошибка", issues: error.issues }, true);
  }
  return result({ status: "ошибка", message: error.message }, true);
}

server.registerTool(
  "onliner_auth_status",
  {
    title: "Проверить вход в Onliner",
    description:
      "Проверяет наличие авторизованной сессии в отдельном постоянном браузерном профиле. " +
      "Не читает и не возвращает cookie или пароль.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    try {
      return result(await browser.authStatus());
    } catch (error) {
      return safeError(error);
    }
  },
);

server.registerTool(
  "onliner_start_login",
  {
    title: "Открыть вход в Onliner",
    description:
      "Открывает страницу входа Onliner в видимом постоянном профиле. Пользователь самостоятельно " +
      "вводит пароль и проходит MFA/CAPTCHA; секреты не принимаются аргументами.",
    inputSchema: {},
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async () => {
    try {
      return result(await browser.startLogin());
    } catch (error) {
      return safeError(error);
    }
  },
);

server.registerTool(
  "onliner_find_categories",
  {
    title: "Найти категорию Барахолки",
    description:
      "Читает актуальные категории с главной страницы Барахолки и ранжирует их по товару. " +
      "Возвращает forum_id; публикация требует отдельной смысловой проверки категории.",
    inputSchema: {
      query: z.string().default(""),
      category_hint: z.string().default(""),
      limit: z.number().int().min(1).max(50).default(12),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (input) => {
    try {
      return result(await browser.getCategories(input));
    } catch (error) {
      return safeError(error);
    }
  },
);

server.registerTool(
  "onliner_find_regions",
  {
    title: "Найти регион Барахолки",
    description:
      "Читает доступные значения региона из актуальной формы выбранной категории. Возвращает value " +
      "для region_id и видимое label для region_name; требует авторизованную сессию.",
    inputSchema: {
      category_forum_id: z.number().int().positive(),
      query: z.string().default(""),
      limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (input) => {
    try {
      return result(await browser.getRegions(input));
    } catch (error) {
      return safeError(error);
    }
  },
);

server.registerTool(
  "onliner_preview_listing",
  {
    title: "Подготовить preview объявления Onliner",
    description:
      "Проверяет авторизацию, живую категорию и форму, ищет вероятный дубликат и сохраняет неизменяемый " +
      "локальный пакет. Ничего не публикует и не загружает на Onliner. Возвращает approval_id только " +
      "для точного пакета, который нужно показать пользователю.",
    inputSchema: listingSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (input) => {
    try {
      const listing = await validateAndNormalizeListing(input);
      const inspection = await browser.previewListing(listing);
      if (!inspection.ready_for_approval) return result(inspection);
      const approvalId = createApprovalId(listing);
      const digest = listingDigest(listing);
      const approval = await store.saveApproval(approvalId, listing, digest);
      return result({
        ...inspection,
        approval_id: approvalId,
        expires_at: approval.expires_at,
        exact_listing: publicListingSummary(listing),
        next_action:
          "Покажите exact_listing пользователю и запросите явное согласие на публикацию именно этой версии.",
      });
    } catch (error) {
      return safeError(error);
    }
  },
);

server.registerTool(
  "onliner_publish_listing",
  {
    title: "Опубликовать одобренное объявление Onliner",
    description:
      "Однократно публикует ранее проверенный неизменный пакет. Вызывайте только после явного одобрения " +
      "exact_listing пользователем. При таймауте сохраняет «результат неизвестен» и запрещает повтор.",
    inputSchema: {
      approval_id: z.string().min(1),
      confirmation: z.literal(PUBLISH_CONFIRMATION).describe(
        `Точная строка ${PUBLISH_CONFIRMATION}; не передавать без явного одобрения пользователя`,
      ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ approval_id: approvalId, confirmation }) => {
    try {
      return result(await browser.publishListing(approvalId, confirmation));
    } catch (error) {
      return safeError(error);
    }
  },
);

const shutdown = async () => {
  await browser.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await store.initialize();
await server.connect(new StdioServerTransport());
