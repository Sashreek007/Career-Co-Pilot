const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value) {
  const raw = String(value || "").replace(/\r/g, "\n");
  const cleaned = raw
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

function makeAbsoluteUrl(href) {
  const raw = String(href || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return "";
  }
}

function isRemoteFromText(...values) {
  const joined = values.map((v) => String(v || "").toLowerCase()).join(" ");
  return /\bremote\b/.test(joined);
}

function getPlatform() {
  const host = window.location.hostname.toLowerCase();
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("indeed.")) return "indeed";
  return "unsupported";
}

function getLinkedInCards() {
  const selectors = [
    ".jobs-search-results-list li",
    ".jobs-search-results__list-item",
    ".scaffold-layout__list-item",
    "[data-occludable-job-id]",
    "[data-job-id]",
  ];
  const merged = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  return Array.from(new Set(merged));
}

function extractLinkedInDetailText() {
  const nodes = [
    document.querySelector(".jobs-description-content__text"),
    document.querySelector(".jobs-box__html-content"),
    document.querySelector(".jobs-search__job-details--wrapper"),
    document.querySelector(".jobs-details__main-content"),
    document.querySelector(".jobs-description"),
  ];
  for (const node of nodes) {
    const text = normalizeMultilineText(node?.innerText || "");
    if (text.length > 120) return text;
  }
  return "";
}

function extractLinkedInField(card, selectors) {
  for (const selector of selectors) {
    const text = normalizeText(card?.querySelector(selector)?.textContent || "");
    if (text) return text;
  }
  return "";
}

function extractLinkedInAnchor(card) {
  return (
    card?.querySelector("a.job-card-list__title--link") ||
    card?.querySelector(".artdeco-entity-lockup__title a") ||
    card?.querySelector("a[href*='/jobs/view/']")
  );
}

async function captureLinkedInFromCard(card, { preferDetail = true } = {}) {
  if (!card) return null;
  const anchor = extractLinkedInAnchor(card);
  if (!anchor) return null;
  const sourceUrl = makeAbsoluteUrl(anchor.getAttribute("href"));
  if (!sourceUrl.includes("/jobs/view/")) return null;

  if (preferDetail) {
    try {
      anchor.click();
      await sleep(350);
    } catch {}
  }

  const title =
    normalizeText(
      anchor.getAttribute("aria-label") ||
        extractLinkedInField(card, [
          ".job-card-list__title",
          ".base-search-card__title",
          ".artdeco-entity-lockup__title",
        ]) ||
        anchor.textContent
    ) || "LinkedIn Job";

  const company = extractLinkedInField(card, [
    ".artdeco-entity-lockup__subtitle",
    ".job-card-container__company-name",
    ".base-search-card__subtitle",
  ]);
  const location = extractLinkedInField(card, [
    ".job-card-container__metadata-item",
    ".artdeco-entity-lockup__caption",
    ".job-search-card__location",
  ]);

  let description = extractLinkedInDetailText();
  if (!description) {
    description = normalizeMultilineText(
      extractLinkedInField(card, [
        ".job-card-list__description",
        ".base-search-card__metadata",
        ".job-card-container__job-insight-text",
      ]) || card?.innerText
    );
  }
  if (description.length < 180 && preferDetail) {
    await sleep(550);
    const retried = extractLinkedInDetailText();
    if (retried.length > description.length) description = retried;
  }

  return {
    sourceUrl,
    title,
    company: company || "LinkedIn",
    location: location || "Remote",
    description,
    remote: isRemoteFromText(location, description),
  };
}

async function captureLinkedInJobs(mode, maxJobs) {
  const cards = getLinkedInCards();
  if (!cards.length) {
    return [];
  }

  if (mode === "current") {
    const active =
      document.querySelector(".jobs-search-results__list-item--active") ||
      document.querySelector("[aria-current='true']")?.closest("li, .jobs-search-results__list-item") ||
      cards[0];
    const item = await captureLinkedInFromCard(active, { preferDetail: true });
    return item ? [item] : [];
  }

  const jobs = [];
  for (const card of cards.slice(0, Math.max(1, maxJobs))) {
    const item = await captureLinkedInFromCard(card, { preferDetail: true });
    if (item?.sourceUrl) jobs.push(item);
  }
  return jobs;
}

function getIndeedCards() {
  const selectors = [
    "[data-jk]",
    ".job_seen_beacon",
    "[data-testid='slider_item']",
  ];
  const merged = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  return Array.from(new Set(merged));
}

function extractIndeedDetailText() {
  const nodes = [
    document.querySelector("#jobDescriptionText"),
    document.querySelector("[data-testid='jobsearch-JobComponent-description']"),
    document.querySelector(".jobsearch-JobComponent"),
  ];
  for (const node of nodes) {
    const text = normalizeMultilineText(node?.innerText || "");
    if (text.length > 120) return text;
  }
  return "";
}

function extractIndeedField(card, selectors) {
  for (const selector of selectors) {
    const text = normalizeText(card?.querySelector(selector)?.textContent || "");
    if (text) return text;
  }
  return "";
}

function extractIndeedAnchor(card) {
  return (
    card?.querySelector("a.jcs-JobTitle") ||
    card?.querySelector("a[href*='/viewjob']") ||
    card?.querySelector("h2 a")
  );
}

async function captureIndeedFromCard(card, { preferDetail = true } = {}) {
  if (!card) return null;
  const anchor = extractIndeedAnchor(card);
  if (!anchor) return null;
  const sourceUrl = makeAbsoluteUrl(anchor.getAttribute("href"));
  if (!sourceUrl.includes("/viewjob")) return null;

  if (preferDetail) {
    try {
      anchor.click();
      await sleep(450);
    } catch {}
  }

  const title = normalizeText(anchor.textContent || "Indeed Job");
  const company = extractIndeedField(card, ["[data-testid='company-name']", ".companyName"]);
  const location = extractIndeedField(card, ["[data-testid='text-location']", ".companyLocation"]);
  let description = extractIndeedDetailText();
  if (!description) {
    description = normalizeMultilineText(
      extractIndeedField(card, [".job-snippet", ".summary"]) || card?.innerText
    );
  }
  if (description.length < 180 && preferDetail) {
    await sleep(550);
    const retried = extractIndeedDetailText();
    if (retried.length > description.length) description = retried;
  }

  return {
    sourceUrl,
    title: title || "Indeed Job",
    company: company || "Indeed",
    location: location || "Remote",
    description,
    remote: isRemoteFromText(location, description),
  };
}

async function captureIndeedJobs(mode, maxJobs) {
  const cards = getIndeedCards();
  if (!cards.length) {
    return [];
  }

  if (mode === "current") {
    const active =
      document.querySelector("[data-jk].selected") ||
      document.querySelector("[aria-current='true']")?.closest("[data-jk], .job_seen_beacon") ||
      cards[0];
    const item = await captureIndeedFromCard(active, { preferDetail: true });
    return item ? [item] : [];
  }

  const jobs = [];
  for (const card of cards.slice(0, Math.max(1, maxJobs))) {
    const item = await captureIndeedFromCard(card, { preferDetail: true });
    if (item?.sourceUrl) jobs.push(item);
  }
  return jobs;
}

async function captureJobs({ mode = "list", maxJobs = 10 } = {}) {
  const platform = getPlatform();
  if (platform === "linkedin") {
    return { platform, jobs: await captureLinkedInJobs(mode, maxJobs) };
  }
  if (platform === "indeed") {
    return { platform, jobs: await captureIndeedJobs(mode, maxJobs) };
  }
  throw new Error("Open a LinkedIn or Indeed jobs page before capturing.");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "cc_detect_platform") {
    const platform = getPlatform();
    sendResponse({
      ok: true,
      platform,
      href: window.location.href,
      canCapture: platform === "linkedin" || platform === "indeed",
    });
    return false;
  }

  if (message.type === "cc_capture_jobs") {
    captureJobs({
      mode: String(message.mode || "list"),
      maxJobs: Number(message.maxJobs || 10),
    })
      .then((result) => {
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: String(error) });
      });

    return true;
  }

  return false;
});
