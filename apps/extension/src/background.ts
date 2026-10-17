import type { DryRunHistoryReport, InjectionReport, PlatformValidationSyncReport, SubmitVerifyReport } from "./types";

declare const chrome: {
  runtime: {
    onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (value: unknown) => void
        ) => boolean | void
      ): void;
    };
    onInstalled: { addListener(callback: () => void): void };
    onStartup: { addListener(callback: () => void): void };
    lastError?: { message?: string };
  };
  tabs: {
    onUpdated: { addListener(callback: (tabId: number, changeInfo: { status?: string; url?: string }, tab: { url?: string }) => void): void };
    onActivated: { addListener(callback: (activeInfo: { tabId: number }) => void): void };
    get(tabId: number, callback: (tab: { id?: number; url?: string }) => void): void;
    query(queryInfo: { url?: string[] }, callback: (tabs: Array<{ id?: number; url?: string }>) => void): void;
    sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void): void;
    update(tabId: number, updateProperties: { url: string }, callback?: () => void): void;
  };
  alarms: {
    create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number }): void;
    onAlarm: { addListener(callback: (alarm: { name: string }) => void): void };
  };
};

const activeAutomation = new Set<number>();
const retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
const retryDelays = [0, 1200, 3000, 6000, 10000, 20000, 30000];
const mediumWatchdogAlarm = "entitymanager-medium-watchdog";

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url || !/^https:\/\/(?:www\.)?medium\.com\//i.test(tab.url)) return;
  scheduleMediumAutomation(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab.url && /^https:\/\/(?:www\.)?medium\.com\//i.test(tab.url)) scheduleMediumAutomation(tabId, tab.url);
  });
});

chrome.runtime.onInstalled.addListener(startMediumWatchdog);
chrome.runtime.onStartup.addListener(startMediumWatchdog);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === mediumWatchdogAlarm) scanOpenMediumTabs();
});

startMediumWatchdog();

function startMediumWatchdog(): void {
  chrome.alarms.create(mediumWatchdogAlarm, { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  scanOpenMediumTabs();
}

function scanOpenMediumTabs(): void {
  chrome.tabs.query({ url: ["https://medium.com/*", "https://www.medium.com/*"] }, (tabs) => {
    for (const tab of tabs) if (tab.id && tab.url) scheduleMediumAutomation(tab.id, tab.url);
  });
}

function scheduleMediumAutomation(tabId: number, currentUrl: string, attempt = 0): void {
  const previous = retryTimers.get(tabId);
  if (attempt === 0 && previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    retryTimers.delete(tabId);
    if (activeAutomation.has(tabId)) {
      scheduleMediumAutomation(tabId, currentUrl, Math.min(attempt + 1, retryDelays.length - 1));
      return;
    }
    activeAutomation.add(tabId);
    void runMediumBackgroundStep(tabId, currentUrl)
      .then((completed) => {
        if (!completed && attempt + 1 < retryDelays.length) scheduleMediumAutomation(tabId, currentUrl, attempt + 1);
      })
      .finally(() => activeAutomation.delete(tabId));
  }, retryDelays[attempt] ?? retryDelays[retryDelays.length - 1]);
  retryTimers.set(tabId, timer);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const typedMessage = message as { type?: string; report?: InjectionReport | SubmitVerifyReport; dryRunReport?: DryRunHistoryReport; validationReport?: PlatformValidationSyncReport; callbackUrl?: string };

  if (typedMessage.type === "ENTITYMANAGER_REPORT_DRY_RUN" && typedMessage.dryRunReport) {
    void postDryRunHistory(typedMessage.dryRunReport, typedMessage.callbackUrl)
      .then((messageText) => sendResponse({ success: true, message: messageText }))
      .catch((error: unknown) => sendResponse({ success: false, message: error instanceof Error ? error.message : "Dry-run history callback failed" }));
    return true;
  }

  if (typedMessage.type === "ENTITYMANAGER_REPORT_PLATFORM_VALIDATION" && typedMessage.validationReport) {
    void postPlatformValidation(typedMessage.validationReport, typedMessage.callbackUrl)
      .then((messageText) => sendResponse({ success: true, message: messageText }))
      .catch((error: unknown) => sendResponse({ success: false, message: error instanceof Error ? error.message : "Platform validation callback failed" }));
    return true;
  }

  if (typedMessage.type === "ENTITYMANAGER_REPORT_INJECTION" && typedMessage.report) {
    void postReport(typedMessage.report, typedMessage.callbackUrl, "Injection")
      .then((messageText) => sendResponse({ success: true, message: messageText }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Desktop callback failed";
        sendResponse({ success: false, message });
      });

    return true;
  }

  if (typedMessage.type === "ENTITYMANAGER_REPORT_SUBMIT_VERIFY" && typedMessage.report) {
    void postReport(typedMessage.report, typedMessage.callbackUrl, "Submit/verify")
      .then((messageText) => sendResponse({ success: true, message: messageText }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Desktop callback failed";
        sendResponse({ success: false, message });
      });

    return true;
  }

  return false;
});

async function postReport(report: InjectionReport | SubmitVerifyReport, callbackUrl: string | undefined, label: string): Promise<string> {
  if (!callbackUrl?.trim()) {
    return `${label} completed locally. No desktop callback URL configured.`;
  }

  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(report)
  });

  if (!response.ok) {
    throw new Error(`Desktop callback returned HTTP ${response.status}`);
  }

  return `${label} callback sent to desktop bridge.`;
}


async function postDryRunHistory(report: DryRunHistoryReport, callbackUrl: string | undefined): Promise<string> {
  if (!callbackUrl?.trim()) throw new Error("Desktop dry-run history callback URL is not configured.");
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report)
  });
  if (!response.ok) throw new Error(`Desktop dry-run history callback returned HTTP ${response.status}`);
  return "Dry-run history saved to Desktop.";
}

async function postPlatformValidation(report: PlatformValidationSyncReport, callbackUrl: string | undefined): Promise<string> {
  if (!callbackUrl?.trim()) throw new Error("Desktop platform validation callback URL is not configured.");
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report)
  });
  if (!response.ok) throw new Error(`Desktop platform validation callback returned HTTP ${response.status}`);
  return "Platform validation auto-synced to Desktop.";
}

async function runMediumBackgroundStep(tabId: number, currentUrl: string): Promise<boolean> {
  let jobReady = false;
  try {
    const jobResponse = await fetch("http://127.0.0.1:17321/provisioning/job/platform?platformId=medium");
    if (!jobResponse.ok) return false;
    jobReady = true;
    const job = await jobResponse.json() as { stage?: string; profileUrl?: string };
    const payloadResponse = await fetch("http://127.0.0.1:17321/account/submit-verify/platform?platformId=medium");
    if (!payloadResponse.ok) {
      const detail = await safeResponseError(payloadResponse);
      await postProvisioningCheckpoint("medium", "signup", "waiting_user", `Bridge chưa lấy được payload Medium: ${detail}`, "");
      return false;
    }
    const payload = await payloadResponse.json() as { formValues?: { email?: string; displayName?: string }; [key: string]: unknown };
    const authPage = /\/(?:signin|signup|login|register)(?:[/?#]|$)/i.test(currentUrl) || /operation=(?:register|login)/i.test(currentUrl);
    if (authPage) {
      const result = await sendTabMessage<{ success: boolean; waitingForVerification: boolean; message: string }>(tabId, {
        type: "ENTITYMANAGER_MEDIUM_SIGNUP",
        email: payload.formValues?.email || "",
        displayName: payload.formValues?.displayName || ""
      });
      await postProvisioningCheckpoint("medium", result.waitingForVerification ? "email_verification" : "signup", result.waitingForVerification ? "waiting_user" : "running", result.message, "");
      return result.waitingForVerification;
    }

    if (!/medium\.com\/me\/(?:settings|about)/i.test(currentUrl) && job.profileUrl) {
      await postProvisioningCheckpoint("medium", "profile_text", "running", "Đã xác minh đăng nhập; background worker đang mở trang profile Medium.", "");
      chrome.tabs.update(tabId, { url: job.profileUrl });
      return true;
    }

    if (/medium\.com\/me\/(?:settings|about)/i.test(currentUrl)) {
      const result = await sendTabMessage<{ success: boolean; message: string; evidenceUrl: string }>(tabId, {
        type: "ENTITYMANAGER_SUBMIT_VERIFY",
        payload,
        fillOnly: false
      });
      await postProvisioningCheckpoint("medium", result.success ? "profile_media" : "profile_text", result.success ? "running" : "waiting_user", result.message, result.evidenceUrl || "");
      return result.success;
    }
    return false;
  } catch (error) {
    if (jobReady) {
      const detail = error instanceof Error ? error.message : String(error);
      try {
        await postProvisioningCheckpoint("medium", "signup", "waiting_user", `Medium worker lỗi: ${detail}`, currentUrl);
      } catch {
        // The Desktop bridge may be restarting; the watchdog will retry.
      }
    }
    return false;
  }
}

async function safeResponseError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message || "Content bridge unavailable."));
      resolve(response as T);
    });
  });
}

async function postProvisioningCheckpoint(platformId: string, stage: string, status: string, message: string, evidenceUrl: string): Promise<void> {
  await fetch("http://127.0.0.1:17321/provisioning/job/checkpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platformId, stage, status, message, evidenceUrl })
  });
}
