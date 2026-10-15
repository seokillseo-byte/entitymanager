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
    lastError?: { message?: string };
  };
  tabs: {
    onUpdated: { addListener(callback: (tabId: number, changeInfo: { status?: string; url?: string }, tab: { url?: string }) => void): void };
    sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void): void;
    update(tabId: number, updateProperties: { url: string }, callback?: () => void): void;
  };
};

const activeAutomation = new Set<number>();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url || !/^https:\/\/(?:www\.)?medium\.com\//i.test(tab.url)) return;
  if (activeAutomation.has(tabId)) return;
  activeAutomation.add(tabId);
  void runMediumBackgroundStep(tabId, tab.url).finally(() => activeAutomation.delete(tabId));
});

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

async function runMediumBackgroundStep(tabId: number, currentUrl: string): Promise<void> {
  try {
    const jobResponse = await fetch("http://127.0.0.1:17321/provisioning/job/platform?platformId=medium");
    if (!jobResponse.ok) return;
    const job = await jobResponse.json() as { stage?: string; profileUrl?: string };
    const payloadResponse = await fetch("http://127.0.0.1:17321/account/submit-verify/platform?platformId=medium");
    if (!payloadResponse.ok) return;
    const payload = await payloadResponse.json() as { formValues?: { email?: string; displayName?: string }; [key: string]: unknown };
    const authPage = /\/(?:signin|signup|login|register)(?:[/?#]|$)/i.test(currentUrl) || /operation=(?:register|login)/i.test(currentUrl);
    if (authPage) {
      const result = await sendTabMessage<{ success: boolean; waitingForVerification: boolean; message: string }>(tabId, {
        type: "ENTITYMANAGER_MEDIUM_SIGNUP",
        email: payload.formValues?.email || "",
        displayName: payload.formValues?.displayName || ""
      });
      await postProvisioningCheckpoint("medium", result.waitingForVerification ? "email_verification" : "signup", result.waitingForVerification ? "waiting_user" : "running", result.message, "");
      return;
    }

    if (!/medium\.com\/me\/(?:settings|about)/i.test(currentUrl) && job.profileUrl) {
      await postProvisioningCheckpoint("medium", "profile_text", "running", "Đã xác minh đăng nhập; background worker đang mở trang profile Medium.", "");
      chrome.tabs.update(tabId, { url: job.profileUrl });
      return;
    }

    if (/medium\.com\/me\/(?:settings|about)/i.test(currentUrl)) {
      const result = await sendTabMessage<{ success: boolean; message: string; evidenceUrl: string }>(tabId, {
        type: "ENTITYMANAGER_SUBMIT_VERIFY",
        payload,
        fillOnly: false
      });
      await postProvisioningCheckpoint("medium", result.success ? "profile_media" : "profile_text", result.success ? "running" : "waiting_user", result.message, result.evidenceUrl || "");
    }
  } catch {
    // Desktop may be closed or Medium may still be rendering. A later navigation retries safely.
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
