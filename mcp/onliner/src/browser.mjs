import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

import { normalizeForSearch, rankCategories } from "./categories.mjs";
import { listingDigest } from "./listing.mjs";

const BARAHOLKA_URL = "https://baraholka.onliner.by/";
const LOGIN_URL = "https://profile.onliner.by/login";
const PUBLISH_CONFIRMATION = "PUBLISH APPROVED LISTING";

const BLOCKER_PATTERNS = [
  ["captcha", /captcha|капч|я не робот/i],
  ["mfa", /двухфактор|одноразов.{0,20}код|код подтверждения/i],
  ["identity", /подтвердите.{0,30}(личност|телефон|номер)|это ваш номер\?/i],
  ["fee", /платн.{0,20}размещ|для публикации.{0,30}оплат|стоимость размещения|комисси.{0,30}публикац/i],
  ["legal", /подтверждаю.{0,40}(право|собствен|подлин)|принять.{0,20}услов/i],
];

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported browser location.
    }
  }
  return null;
}

export async function resolveBrowserExecutable() {
  return firstExistingPath([
    process.env.ONLINER_BROWSER_EXECUTABLE,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]);
}

function defaultBrowserProfile() {
  return process.env.ONLINER_BROWSER_PROFILE
    ? path.resolve(process.env.ONLINER_BROWSER_PROFILE)
    : path.join(os.homedir(), ".forsalelister", "onliner", "browser-profile");
}

function detectBlocker(bodyText) {
  for (const [kind, pattern] of BLOCKER_PATTERNS) {
    if (pattern.test(bodyText)) return kind;
  }
  return null;
}

function accountFromPage(page) {
  return page.evaluate(() => {
    const model = window.currentUserData ?? null;
    const modelId = model?.id ?? null;
    const currentUser = window.MODELS?.currentUser ?? null;
    const currentUserId = typeof currentUser?.id === "function" ? currentUser.id() : currentUser?.id;
    const modelNickname = currentUser?.nickname;
    const nickname = typeof model?.nickname === "string"
      ? model.nickname
      : typeof modelNickname === "function"
        ? modelNickname()
        : typeof modelNickname === "string"
          ? modelNickname
          : null;
    const logout = Boolean(document.querySelector(".b-top-profile__logout, [data-bind*='logout']"));
    return {
      authenticated: Boolean(modelId || currentUserId || logout),
      account_label: nickname,
    };
  });
}

async function setTextInput(page, name, value, required = true) {
  const locator = page.locator(`[name="${name}"]`).first();
  if ((await locator.count()) === 0) {
    if (required) throw new Error(`На форме Onliner отсутствует поле ${name}`);
    return false;
  }
  await locator.fill(String(value));
  return true;
}

async function setSelectOrInput(page, name, value, required = true) {
  const controls = page.locator(`[name="${name}"]`);
  if ((await controls.count()) === 0) {
    if (required) throw new Error(`На форме Onliner отсутствует поле ${name}`);
    return false;
  }
  const locator = controls.first();
  const tagName = await locator.evaluate((element) => element.tagName.toLowerCase());
  const inputType = (await locator.getAttribute("type"))?.toLowerCase();
  if (tagName === "select") {
    const selected = await locator.selectOption(String(value));
    if (selected.length === 0) {
      throw new Error(`Onliner не принимает значение ${value} для поля ${name}`);
    }
  } else if (inputType === "radio" || inputType === "checkbox") {
    const values = await controls.evaluateAll((elements) => elements.map((element) => element.value));
    const matchingIndex = values.indexOf(String(value));
    if (matchingIndex < 0) {
      throw new Error(`Onliner не принимает значение ${value} для поля ${name}`);
    }
    await controls.nth(matchingIndex).check();
  } else {
    await locator.fill(String(value));
  }
  return true;
}

async function setBooleanControl(page, name, enabled) {
  const locator = page.locator(`[name="${name}"]`).first();
  if ((await locator.count()) === 0) return false;
  const type = (await locator.getAttribute("type"))?.toLowerCase();
  if (type === "checkbox" || type === "radio") {
    if (enabled) await locator.check();
    else if (type === "checkbox") await locator.uncheck();
    else {
      const falseChoice = page.locator(`[name="${name}"][value="0"]`).first();
      if (await falseChoice.count()) await falseChoice.check();
    }
  } else {
    await locator.fill(enabled ? "1" : "0");
  }
  return true;
}

export class OnlinerBrowser {
  constructor({ stateStore, executablePath, userDataDir = defaultBrowserProfile() } = {}) {
    this.stateStore = stateStore;
    this.executablePath = executablePath;
    this.userDataDir = userDataDir;
    this.context = null;
    this.page = null;
  }

  async ensurePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    const executablePath = this.executablePath ?? await resolveBrowserExecutable();
    if (!executablePath) {
      throw new Error(
        "Не найден Google Chrome, Microsoft Edge или Chromium. " +
        "Задайте ONLINER_BROWSER_EXECUTABLE.",
      );
    }
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      executablePath,
      headless: process.env.ONLINER_HEADLESS === "1",
      viewport: { width: 1440, height: 1000 },
      locale: "ru-BY",
      args: ["--disable-features=Translate"],
    });
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    return this.page;
  }

  async close() {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }

  async startLogin() {
    const page = await this.ensurePage();
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    return {
      status: "требуется действие пользователя",
      login_url: page.url(),
      instruction:
        "Завершите вход, MFA или CAPTCHA в открытом окне браузера, затем вызовите onliner_auth_status. " +
        "Не передавайте пароль, cookie или коды инструменту.",
    };
  }

  async authStatus() {
    const page = await this.ensurePage();
    await page.goto(BARAHOLKA_URL, { waitUntil: "domcontentloaded" });
    const account = await accountFromPage(page);
    return {
      ...account,
      status: account.authenticated ? "авторизован" : "не авторизован",
      next_action: account.authenticated
        ? null
        : "Вызовите onliner_start_login и завершите вход вручную.",
    };
  }

  async getCategories({ query = "", category_hint = "", limit = 12 } = {}) {
    const page = await this.ensurePage();
    await page.goto(BARAHOLKA_URL, { waitUntil: "domcontentloaded" });
    const categories = await page.evaluate(() => {
      const seen = new Set();
      const results = [];
      for (const anchor of document.querySelectorAll("a[href*='viewforum.php?f=']")) {
        const url = new URL(anchor.href, window.location.href);
        const forumId = Number(url.searchParams.get("f"));
        const name = anchor.textContent.replace(/\s+/g, " ").trim();
        if (!Number.isSafeInteger(forumId) || !name || seen.has(forumId)) continue;
        seen.add(forumId);

        let section = "";
        let current = anchor.parentElement;
        for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
          const heading = current.querySelector(":scope > h2, :scope > h3, :scope > h4");
          if (heading?.textContent.trim()) {
            section = heading.textContent.replace(/\s+/g, " ").trim();
            break;
          }
        }
        results.push({ forum_id: forumId, name, section, url: url.href });
      }
      return results;
    });

    return {
      query,
      category_hint,
      total_live_categories: categories.length,
      candidates: rankCategories(categories, query, category_hint, limit),
      warning:
        "Выберите forum_id только после смысловой проверки названия категории. " +
        "Если первые кандидаты неоднозначны, запросите список с более точным category_hint.",
    };
  }

  async getRegions({ category_forum_id: forumId, query = "", limit = 20 } = {}) {
    const page = await this.ensurePage();
    const form = await this.inspectPostingForm(page, { category_forum_id: Number(forumId) });
    if (!form.ready) {
      return {
        status: form.blocker === "login" ? "заблокировано" : "требуется действие пользователя",
        blocker: form.blocker ?? "форма Onliner изменилась",
        next_action: form.blocker === "login"
          ? "Вызовите onliner_start_login."
          : "Завершите проверку в открытом окне и повторите запрос регионов.",
      };
    }
    const needle = normalizeForSearch(query);
    const candidates = form.regions
      .filter((region) => !needle || normalizeForSearch(region.label).includes(needle))
      .slice(0, Math.max(1, Math.min(Number(limit) || 20, 100)));
    return {
      status: "готово",
      category_forum_id: Number(forumId),
      query,
      candidates,
      warning: candidates.length
        ? "Перед preview передайте одновременно value как region_id и label как region_name."
        : "Форма не вернула подходящий регион. Выберите область/город вручную в открытом окне или уточните запрос.",
    };
  }

  async inspectCategory(page, listing) {
    const url = `${BARAHOLKA_URL}viewforum.php?f=${listing.category_forum_id}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const details = await page.evaluate(() => {
      const heading = document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim()
        ?? document.title.split(" - ")[0].trim();
      const topics = [];
      const seen = new Set();
      for (const anchor of document.querySelectorAll("a[href*='viewtopic.php']")) {
        const title = anchor.textContent.replace(/\s+/g, " ").trim();
        if (!title || seen.has(anchor.href)) continue;
        seen.add(anchor.href);
        const container = anchor.closest("li, tr, article, .ba-topic-item") ?? anchor.parentElement;
        topics.push({
          title,
          url: anchor.href,
          context: container?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        });
      }
      return { heading, topics };
    });
    const expected = normalizeForSearch(listing.category_name);
    const actual = normalizeForSearch(details.heading);
    if (!expected || !(actual.includes(expected) || expected.includes(actual))) {
      throw new Error(
        `Категория не совпала: forum_id=${listing.category_forum_id} сейчас называется ` +
        `«${details.heading}», а в пакете указано «${listing.category_name}».`,
      );
    }
    return { ...details, url };
  }

  async inspectPostingForm(page, listing) {
    const url = `${BARAHOLKA_URL}posting.php?mode=post&f=${listing.category_forum_id}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const account = await accountFromPage(page);
    if (!account.authenticated) {
      return { ready: false, account, blocker: "login", url: page.url() };
    }

    const details = await page.evaluate(() => {
      const form = document.querySelector("form[action*='posting.php'], form#postform");
      const token = form?.querySelector("input[name='form_token']")?.value ?? "";
      const currencies = [...(form?.querySelectorAll(
        "select[name='topic_currency'] option, input[name='topic_currency'][value]",
      ) ?? [])].map((option) => option.value).filter(Boolean);
      const regions = [...(form?.querySelectorAll("select[name='region'] option") ?? [])]
        .map((option) => ({ value: option.value, label: option.textContent.trim() }))
        .filter((option) => option.value && option.label);
      return {
        has_form: Boolean(form),
        has_csrf_fields: Boolean(token && form?.querySelector("input[name='creation_time']")),
        has_subject: Boolean(form?.querySelector("input[name='subject']")),
        has_message: Boolean(form?.querySelector("textarea[name='message']")),
        currencies,
        regions,
        body_text: [
          form?.innerText ?? "",
          ...[...document.querySelectorAll(
            ".auth-alert_visible, .captcha, [class*='captcha'], [class*='verification']",
          )].map((element) => element.innerText),
        ].join("\n").slice(0, 12000),
      };
    });
    const blocker = detectBlocker(details.body_text);
    return {
      ready: details.has_form && details.has_csrf_fields && details.has_subject && details.has_message && !blocker,
      account,
      blocker,
      url: page.url(),
      currencies: details.currencies,
      regions: details.regions,
    };
  }

  duplicateCandidates(category, listing, accountLabel) {
    const title = normalizeForSearch(listing.title);
    const identifiers = listing.strong_identifiers.map(normalizeForSearch).filter(Boolean);
    return category.topics
      .filter((topic) => {
        const topicTitle = normalizeForSearch(topic.title);
        const context = normalizeForSearch(topic.context);
        const sameAccount = accountLabel && context.includes(normalizeForSearch(accountLabel));
        const sameTitle = topicTitle === title;
        const sameIdentifier = identifiers.some((identifier) => context.includes(identifier));
        return sameAccount && (sameTitle || sameIdentifier);
      })
      .slice(0, 10)
      .map(({ title: topicTitle, url }) => ({ title: topicTitle, url }));
  }

  async previewListing(listing) {
    const page = await this.ensurePage();
    const category = await this.inspectCategory(page, listing);
    const form = await this.inspectPostingForm(page, listing);
    if (!form.ready) {
      return {
        ready_for_approval: false,
        status: form.blocker === "login" ? "заблокировано" : "требуется действие пользователя",
        blocker: form.blocker ?? "форма Onliner изменилась",
        account_label: form.account.account_label,
        next_action: form.blocker === "login"
          ? "Вызовите onliner_start_login."
          : "Завершите проверку в открытом окне и повторно создайте preview.",
      };
    }
    if (form.currencies.length && !form.currencies.includes(listing.currency)) {
      throw new Error(`В актуальной форме недоступна валюта ${listing.currency}`);
    }
    let verifiedRegion = null;
    if (form.regions.length) {
      verifiedRegion = form.regions.find((region) => region.value === listing.region_id) ?? null;
      if (!verifiedRegion) {
        throw new Error(`В актуальной форме недоступен region_id=${listing.region_id}`);
      }
      const expectedRegion = normalizeForSearch(listing.region_name);
      const actualRegion = normalizeForSearch(verifiedRegion.label);
      if (!(actualRegion.includes(expectedRegion) || expectedRegion.includes(actualRegion))) {
        throw new Error(
          `Регион не совпал: region_id=${listing.region_id} сейчас называется ` +
          `«${verifiedRegion.label}», а в пакете указано «${listing.region_name}».`,
        );
      }
    }
    const duplicateCandidates = this.duplicateCandidates(
      category,
      listing,
      form.account.account_label,
    );
    if (duplicateCandidates.length) {
      return {
        ready_for_approval: false,
        status: "заблокировано",
        blocker: "возможный дубликат объявления этого аккаунта",
        duplicate_candidates: duplicateCandidates,
        next_action: "Проверьте найденные объявления; не публикуйте повторно до устранения дубликата.",
      };
    }
    return {
      ready_for_approval: true,
      status: "готово к проверке",
      account_label: form.account.account_label,
      live_category: { name: category.heading, url: category.url },
      live_form: {
        currency_verified: true,
        csrf_fields_present: true,
        region_verified: verifiedRegion ? true : null,
      },
      digest: listingDigest(listing),
      duplicate_candidates: [],
    };
  }

  async fillListingForm(page, listing) {
    const form = await this.inspectPostingForm(page, listing);
    if (!form.ready) {
      throw new Error(`Форма публикации заблокирована: ${form.blocker ?? "неизвестная причина"}`);
    }

    await setTextInput(page, "subject", listing.title);
    await setTextInput(page, "topic_desc", listing.short_description, false);
    await setTextInput(page, "message", listing.public_message);
    await setTextInput(page, "topic_price", listing.price);
    await setSelectOrInput(page, "topic_currency", listing.currency);
    await setSelectOrInput(page, "region", listing.region_id);
    await setBooleanControl(page, "topic_torg", listing.negotiable);

    const listingKind = page.locator("input[name='topic_bar_cat'][value='1']").first();
    if (await listingKind.count()) {
      const type = (await listingKind.getAttribute("type"))?.toLowerCase();
      if (type === "radio" || type === "checkbox") await listingKind.check();
      else await listingKind.fill("1");
    }

    const fileInput = page.locator("input[type='file'][name='file'], .file-uploader input[type='file']").first();
    if ((await fileInput.count()) === 0) {
      throw new Error("Onliner не показал поле загрузки фотографий");
    }
    await fileInput.setInputFiles(listing.photo_paths);
    await page.waitForFunction(
      (expected) => {
        const failed = document.querySelectorAll(".file-uploader .qq-upload-failed").length;
        const processed = document.querySelectorAll(
          ".file-uploader .qq-upload-file:not(.qq-loading):not(.qq-upload-failed) img",
        ).length;
        return failed > 0 || processed >= expected;
      },
      listing.photo_paths.length,
      { timeout: 120_000 },
    );
    const upload = await page.evaluate((expected) => {
      const failed = document.querySelectorAll(".file-uploader .qq-upload-failed").length;
      const images = [...document.querySelectorAll(
        ".file-uploader .qq-upload-file:not(.qq-loading):not(.qq-upload-failed) img",
      )].slice(0, expected);
      const filenames = images.map((image) => {
        try {
          return new URL(image.src).pathname.split("/").pop();
        } catch {
          return "";
        }
      }).filter(Boolean);
      const message = document.querySelector("textarea[name='message']")?.value ?? "";
      return {
        failed,
        processed: images.length,
        filenames,
        image_tags: (message.match(/\[img=/g) ?? []).length,
      };
    }, listing.photo_paths.length);
    if (upload.failed || upload.processed !== listing.photo_paths.length) {
      throw new Error("Не все фотографии обработаны Onliner; публикация остановлена");
    }
    if (upload.image_tags < listing.photo_paths.length) {
      throw new Error("Onliner не добавил все загруженные фотографии в текст; публикация остановлена");
    }
    const topicIcon = page.locator("input[name='topic_icon']").first();
    if (await topicIcon.count()) {
      const current = await topicIcon.inputValue();
      if (!current && upload.filenames[0]) await topicIcon.fill(upload.filenames[0]);
    }
    return upload;
  }

  async reconcilePublishedListing(listing, accountLabel) {
    const page = await this.context.newPage();
    try {
      const category = await this.inspectCategory(page, listing);
      const matches = this.duplicateCandidates(category, listing, accountLabel);
      return matches.length === 1 ? matches[0] : null;
    } finally {
      await page.close();
    }
  }

  async publishListing(approvalId, confirmation) {
    if (confirmation !== PUBLISH_CONFIRMATION) {
      return {
        status: "заблокировано",
        blocker: `confirmation должен точно равняться «${PUBLISH_CONFIRMATION}»`,
      };
    }
    const previousAttempt = await this.stateStore.getAttempt(approvalId);
    if (previousAttempt) {
      return {
        status: previousAttempt.status,
        listing_id: previousAttempt.listing_id ?? null,
        listing_url: previousAttempt.listing_url ?? null,
        retry_prohibited: true,
        message: "Для этого approval_id попытка уже зафиксирована; повторная отправка запрещена.",
      };
    }
    const approval = await this.stateStore.getApproval(approvalId);
    if (!approval || approval.expired) {
      return {
        status: "заблокировано",
        blocker: approval ? "approval_id истёк" : "approval_id не найден",
      };
    }
    if (listingDigest(approval.listing) !== approval.digest) {
      return { status: "заблокировано", blocker: "сохранённый пакет изменился после preview" };
    }

    const page = await this.ensurePage();
    const preview = await this.previewListing(approval.listing);
    if (!preview.ready_for_approval) return preview;
    const claimed = await this.stateStore.claimPublish(approvalId);
    if (!claimed) {
      const claimedAttempt = await this.stateStore.getAttempt(approvalId);
      return {
        status: claimedAttempt?.status ?? "результат неизвестен",
        listing_id: claimedAttempt?.listing_id ?? null,
        listing_url: claimedAttempt?.listing_url ?? null,
        retry_prohibited: true,
        message: "Публикация уже была запущена другим процессом; повторная отправка запрещена.",
      };
    }
    await this.stateStore.saveAttempt(approvalId, {
      status: "результат неизвестен",
      phase: "preparing",
      started_at: new Date().toISOString(),
      retry_prohibited: true,
    });

    let upload;
    try {
      upload = await this.fillListingForm(page, approval.listing);
    } catch (error) {
      return this.stateStore.saveAttempt(approvalId, {
        status: "ошибка",
        phase: "pre_submit_error",
        error: error.message,
        retry_prohibited: true,
      });
    }

    const submit = page.locator(
      "button[type='submit'][name='post']:visible, input[type='submit'][name='post']:visible",
    ).first();
    if ((await submit.count()) === 0) {
      return this.stateStore.saveAttempt(approvalId, {
        status: "ошибка",
        phase: "pre_submit_error",
        error: "кнопка публикации не найдена",
        retry_prohibited: true,
      });
    }

    await this.stateStore.saveAttempt(approvalId, {
      status: "результат неизвестен",
      phase: "before_submit",
      started_at: new Date().toISOString(),
      uploaded_photos: upload.processed,
      retry_prohibited: true,
    });

    let submitError = null;
    try {
      await Promise.all([
        page.waitForURL(/\/viewtopic\.php\?/, { timeout: 45_000 }),
        submit.click(),
      ]);
    } catch (error) {
      submitError = error;
    }

    const publishedUrl = page.url();
    if (/\/viewtopic\.php\?/.test(publishedUrl)) {
      const topicId = new URL(publishedUrl).searchParams.get("t");
      return this.stateStore.saveAttempt(approvalId, {
        status: "опубликовано",
        phase: "reconciled_by_redirect",
        listing_id: topicId,
        listing_url: publishedUrl,
        retry_prohibited: true,
      });
    }

    const reconciled = await this.reconcilePublishedListing(
      approval.listing,
      preview.account_label,
    );
    if (reconciled) {
      const topicId = new URL(reconciled.url).searchParams.get("t");
      return this.stateStore.saveAttempt(approvalId, {
        status: "опубликовано",
        phase: "reconciled_by_category",
        listing_id: topicId,
        listing_url: reconciled.url,
        retry_prohibited: true,
      });
    }

    return this.stateStore.saveAttempt(approvalId, {
      status: "результат неизвестен",
      phase: "submit_not_reconciled",
      error: submitError ? "Onliner не подтвердил переход после отправки" : null,
      retry_prohibited: true,
    });
  }
}

export { PUBLISH_CONFIRMATION };
