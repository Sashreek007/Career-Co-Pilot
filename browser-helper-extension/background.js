const DEFAULT_API_BASE = "http://localhost:8000";

function normalizeApiBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_API_BASE;
  if (!/^https?:\/\//i.test(raw)) {
    return `http://${raw}`.replace(/\/+$/, "");
  }
  return raw.replace(/\/+$/, "");
}

async function getSettings() {
  const stored = await chrome.storage.local.get({ apiBase: DEFAULT_API_BASE });
  return { apiBase: normalizeApiBase(stored.apiBase) };
}

async function saveSettings(apiBase) {
  const normalized = normalizeApiBase(apiBase);
  await chrome.storage.local.set({ apiBase: normalized });
  return { apiBase: normalized };
}

function dedupeJobs(jobs) {
  const seen = new Set();
  const output = [];
  for (const item of jobs || []) {
    const sourceUrl = String(item?.sourceUrl || "").trim();
    if (!sourceUrl || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    output.push(item);
  }
  return output;
}

async function importJobsToBackend(jobs, apiBase) {
  const target = normalizeApiBase(apiBase);
  const deduped = dedupeJobs(jobs);
  let imported = 0;
  let failed = 0;
  const errors = [];

  for (const job of deduped) {
    const payload = {
      source_url: String(job.sourceUrl || "").trim(),
      title: String(job.title || "").trim() || undefined,
      company: String(job.company || "").trim() || undefined,
      location: String(job.location || "").trim() || "Remote",
      description: String(job.description || "").trim() || undefined,
      remote: Boolean(job.remote),
    };

    if (!payload.source_url) {
      failed += 1;
      errors.push("Missing source URL in captured job.");
      continue;
    }

    try {
      const response = await fetch(`${target}/jobs/import-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const bodyText = await response.text();
        failed += 1;
        errors.push(`${payload.title || payload.source_url}: ${bodyText.slice(0, 180)}`);
        continue;
      }
      imported += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${payload.title || payload.source_url}: ${String(error).slice(0, 180)}`);
    }
  }

  return {
    apiBase: target,
    captured: deduped.length,
    imported,
    failed,
    errors,
  };
}

async function pingBackend(apiBase) {
  const target = normalizeApiBase(apiBase);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${target}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: body.slice(0, 180),
      apiBase: target,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: String(error),
      apiBase: target,
    };
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.type === "cc_get_settings") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, ...settings }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "cc_save_settings") {
    saveSettings(message.apiBase)
      .then((settings) => sendResponse({ ok: true, ...settings }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "cc_import_jobs") {
    (async () => {
      const settings = await getSettings();
      const apiBase = normalizeApiBase(message.apiBase || settings.apiBase);
      const result = await importJobsToBackend(message.jobs || [], apiBase);
      sendResponse({ ok: true, ...result });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }

  if (message.type === "cc_ping_backend") {
    (async () => {
      const settings = await getSettings();
      const apiBase = normalizeApiBase(message.apiBase || settings.apiBase);
      const result = await pingBackend(apiBase);
      sendResponse({ ok: true, ping: result });
    })().catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }

  return false;
});
