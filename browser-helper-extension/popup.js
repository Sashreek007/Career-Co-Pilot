const DEFAULT_API_BASE = "http://localhost:8000";
const DEFAULT_APP_URL = "http://localhost:3000/jobs";

const elements = {
  apiBase: document.getElementById("apiBase"),
  saveSettings: document.getElementById("saveSettings"),
  checkBackend: document.getElementById("checkBackend"),
  backendStatus: document.getElementById("backendStatus"),
  detectPage: document.getElementById("detectPage"),
  pageStatus: document.getElementById("pageStatus"),
  maxJobs: document.getElementById("maxJobs"),
  captureList: document.getElementById("captureList"),
  captureCurrent: document.getElementById("captureCurrent"),
  openApp: document.getElementById("openApp"),
  result: document.getElementById("result"),
};

const interactiveButtons = [
  elements.saveSettings,
  elements.checkBackend,
  elements.detectPage,
  elements.captureList,
  elements.captureCurrent,
  elements.openApp,
].filter(Boolean);

function normalizeApiBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_API_BASE;
  if (!/^https?:\/\//i.test(raw)) return `http://${raw}`.replace(/\/+$/, "");
  return raw.replace(/\/+$/, "");
}

function setBusy(isBusy) {
  interactiveButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

function setResult(message, tone = "") {
  const result = elements.result;
  if (!result) return;
  result.classList.remove("ok", "warn", "err");
  if (tone) result.classList.add(tone);
  result.textContent = message;
}

function setHint(element, message, tone = "") {
  if (!element) return;
  element.classList.remove("ok", "warn", "err");
  if (tone) element.classList.add(tone);
  element.textContent = message;
}

function clampMaxJobs(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 10;
  return Math.min(30, Math.max(1, Math.round(num)));
}

function runtimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "Runtime messaging failed"));
        return;
      }
      resolve(response);
    });
  });
}

function tabMessage(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "Tab messaging failed"));
        return;
      }
      resolve(response);
    });
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found.");
  }
  return tab;
}

async function loadSettings() {
  try {
    const response = await runtimeMessage({ type: "cc_get_settings" });
    if (!response?.ok) throw new Error(response?.error || "Failed to load settings.");
    elements.apiBase.value = normalizeApiBase(response.apiBase || DEFAULT_API_BASE);
  } catch (error) {
    elements.apiBase.value = DEFAULT_API_BASE;
    setResult(`Could not load saved settings.\n${String(error)}`, "warn");
  }
}

async function saveSettings() {
  const apiBase = normalizeApiBase(elements.apiBase.value);
  setBusy(true);
  try {
    const response = await runtimeMessage({
      type: "cc_save_settings",
      apiBase,
    });
    if (!response?.ok) throw new Error(response?.error || "Save failed.");
    elements.apiBase.value = normalizeApiBase(response.apiBase || apiBase);
    setResult(`Saved backend URL: ${elements.apiBase.value}`, "ok");
  } catch (error) {
    setResult(`Could not save backend URL.\n${String(error)}`, "err");
  } finally {
    setBusy(false);
  }
}

async function checkBackend() {
  const apiBase = normalizeApiBase(elements.apiBase.value);
  setBusy(true);
  setHint(elements.backendStatus, "Checking...");
  try {
    const response = await runtimeMessage({
      type: "cc_ping_backend",
      apiBase,
    });
    if (!response?.ok) throw new Error(response?.error || "Backend check failed.");
    const ping = response.ping || {};
    if (ping.ok === true && ping.status >= 200 && ping.status < 300) {
      setHint(elements.backendStatus, `Connected (${ping.status})`, "ok");
      setResult(`Backend reachable at ${ping.apiBase}`, "ok");
    } else {
      setHint(elements.backendStatus, `Unavailable (${ping.status || "error"})`, "err");
      setResult(
        `Backend not reachable at ${ping.apiBase || apiBase}.\n${String(ping.body || "").slice(0, 220)}`,
        "err"
      );
    }
  } catch (error) {
    setHint(elements.backendStatus, "Unavailable", "err");
    setResult(`Backend check failed.\n${String(error)}`, "err");
  } finally {
    setBusy(false);
  }
}

async function detectPage() {
  setBusy(true);
  try {
    const tab = await getActiveTab();
    const response = await tabMessage(tab.id, { type: "cc_detect_platform" });
    if (!response?.ok) throw new Error(response?.error || "Could not detect page.");
    if (response.canCapture) {
      setHint(elements.pageStatus, `${response.platform} page`, "ok");
      setResult(`Ready to capture from ${response.platform}.\n${response.href}`, "ok");
      return;
    }
    setHint(elements.pageStatus, "Unsupported page", "warn");
    setResult("Open a LinkedIn or Indeed jobs page in this tab, then try again.", "warn");
  } catch (error) {
    setHint(elements.pageStatus, "Unavailable", "warn");
    const suffix = String(error || "").trim();
    const message = suffix
      ? `Could not connect to the current tab. Open a LinkedIn or Indeed jobs page and refresh it first.\n${suffix}`
      : "Could not connect to the current tab. Open a LinkedIn or Indeed jobs page and refresh it first.";
    setResult(message, "warn");
  } finally {
    setBusy(false);
  }
}

function summarizeImport(result, platform) {
  const lines = [
    `Platform: ${platform}`,
    `Captured: ${result.captured}`,
    `Imported: ${result.imported}`,
    `Failed: ${result.failed}`,
  ];
  if (Array.isArray(result.errors) && result.errors.length) {
    lines.push("");
    lines.push("Errors:");
    for (const message of result.errors.slice(0, 6)) {
      lines.push(`- ${message}`);
    }
    if (result.errors.length > 6) {
      lines.push(`- ...and ${result.errors.length - 6} more`);
    }
  }
  return lines.join("\n");
}

async function captureAndImport(mode) {
  const maxJobs = clampMaxJobs(elements.maxJobs.value);
  elements.maxJobs.value = String(maxJobs);
  const apiBase = normalizeApiBase(elements.apiBase.value);
  setBusy(true);
  setResult("Capturing jobs from this tab...");
  try {
    const tab = await getActiveTab();
    const captureResponse = await tabMessage(tab.id, {
      type: "cc_capture_jobs",
      mode,
      maxJobs,
    });
    if (!captureResponse?.ok) {
      throw new Error(captureResponse?.error || "Capture failed.");
    }
    const jobs = Array.isArray(captureResponse.jobs) ? captureResponse.jobs : [];
    if (!jobs.length) {
      setResult("No jobs were captured from this page. Scroll the jobs list and try again.", "warn");
      return;
    }
    setResult(`Captured ${jobs.length} jobs. Importing into Career Co-Pilot...`);

    const importResponse = await runtimeMessage({
      type: "cc_import_jobs",
      apiBase,
      jobs,
    });
    if (!importResponse?.ok) {
      throw new Error(importResponse?.error || "Import failed.");
    }
    const tone = importResponse.imported > 0 ? "ok" : "warn";
    setResult(summarizeImport(importResponse, captureResponse.platform), tone);
  } catch (error) {
    setResult(`Capture/import failed.\n${String(error)}`, "err");
  } finally {
    setBusy(false);
  }
}

async function openApp() {
  try {
    await chrome.tabs.create({ url: DEFAULT_APP_URL });
  } catch (error) {
    setResult(`Could not open app tab.\n${String(error)}`, "err");
  }
}

function bindEvents() {
  elements.saveSettings?.addEventListener("click", () => {
    void saveSettings();
  });
  elements.checkBackend?.addEventListener("click", () => {
    void checkBackend();
  });
  elements.detectPage?.addEventListener("click", () => {
    void detectPage();
  });
  elements.captureList?.addEventListener("click", () => {
    void captureAndImport("list");
  });
  elements.captureCurrent?.addEventListener("click", () => {
    void captureAndImport("current");
  });
  elements.openApp?.addEventListener("click", () => {
    void openApp();
  });
}

async function init() {
  bindEvents();
  await loadSettings();
  await checkBackend();
  await detectPage();
}

void init();
