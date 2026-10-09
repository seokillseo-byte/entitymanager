import type { AccountSubmitVerifyPayload, BridgeStorage, CaptchaInjectionPayload, InjectCaptchaMessage, InjectionReport, InjectionResponse, SubmitVerifyMessage, SubmitVerifyReport, SubmitVerifyResponse } from "./types";

declare const chrome: {
  runtime: {
    lastError?: { message?: string };
    sendMessage(message: unknown, callback?: (response: unknown) => void): void;
  };
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }, callback: (tabs: Array<{ id?: number; url?: string }>) => void): void;
    sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void): void;
  };
  storage: {
    local: {
      get(keys: string[], callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
};
const payloadInput = document.querySelector<HTMLTextAreaElement>("#payloadInput");
const fetchUrlInput = document.querySelector<HTMLInputElement>("#fetchUrlInput");
const callbackUrlInput = document.querySelector<HTMLInputElement>("#callbackUrlInput");
const submitFetchUrlInput = document.querySelector<HTMLInputElement>("#submitFetchUrlInput");
const submitCallbackUrlInput = document.querySelector<HTMLInputElement>("#submitCallbackUrlInput");
const fetchPayloadButton = document.querySelector<HTMLButtonElement>("#fetchPayloadButton");
const savePayloadButton = document.querySelector<HTMLButtonElement>("#savePayloadButton");
const injectButton = document.querySelector<HTMLButtonElement>("#injectButton");
const dryRunButton = document.querySelector<HTMLButtonElement>("#dryRunButton");
const submitVerifyButton = document.querySelector<HTMLButtonElement>("#submitVerifyButton");
const statusOutput = document.querySelector<HTMLPreElement>("#statusOutput");

const defaultFetchUrl = "http://127.0.0.1:17321/captcha/injection/next";
const defaultCallbackUrl = "http://127.0.0.1:17321/captcha/injection/complete";
const defaultSubmitFetchUrl = "http://127.0.0.1:17321/account/submit-verify/next";
const defaultSubmitCallbackUrl = "http://127.0.0.1:17321/account/submit-verify/complete";

void loadState();

fetchPayloadButton?.addEventListener("click", () => {
  void fetchNextPayload();
});

savePayloadButton?.addEventListener("click", () => {
  void savePayload();
});

injectButton?.addEventListener("click", () => {
  void injectActiveTab();
});

dryRunButton?.addEventListener("click", () => {
  void previewSubmitVerifyActiveTab();
});

submitVerifyButton?.addEventListener("click", () => {
  void submitVerifyActiveTab();
});

async function loadState(): Promise<void> {
  const state = await storageGet(["captchaPayload", "submitVerifyPayload", "fetchUrl", "callbackUrl", "submitFetchUrl", "submitCallbackUrl"]);
  const bridgeState = state as BridgeStorage;

  if (payloadInput && bridgeState.captchaPayload) {
    payloadInput.value = JSON.stringify(bridgeState.captchaPayload, null, 2);
  }

  if (fetchUrlInput) {
    fetchUrlInput.value = bridgeState.fetchUrl || defaultFetchUrl;
  }

  if (callbackUrlInput) {
    callbackUrlInput.value = bridgeState.callbackUrl || defaultCallbackUrl;
  }

  if (submitFetchUrlInput) {
    submitFetchUrlInput.value = bridgeState.submitFetchUrl || defaultSubmitFetchUrl;
  }

  if (submitCallbackUrlInput) {
    submitCallbackUrlInput.value = bridgeState.submitCallbackUrl || defaultSubmitCallbackUrl;
  }
}

async function fetchNextPayload(): Promise<void> {
  try {
    const fetchUrl = fetchUrlInput?.value.trim() || defaultFetchUrl;
    const response = await fetch(fetchUrl, { method: "GET" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Desktop did not return a ready CAPTCHA payload.");
    }

    const payload = validatePayload(data as Partial<CaptchaInjectionPayload>);
    const callbackUrl = callbackUrlInput?.value.trim() || defaultCallbackUrl;

    if (payloadInput) {
      payloadInput.value = JSON.stringify(payload, null, 2);
    }

    await storageSet({ captchaPayload: payload, fetchUrl, callbackUrl });
    setStatus(`Fetched next payload for ${payload.platformName}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not fetch payload from Desktop.");
  }
}

async function savePayload(): Promise<void> {
  try {
    const payload = parsePayload();
    const callbackUrl = callbackUrlInput?.value.trim() || defaultCallbackUrl;
    const fetchUrl = fetchUrlInput?.value.trim() || defaultFetchUrl;
    await storageSet({ captchaPayload: payload, fetchUrl, callbackUrl });
    setStatus(`Saved bridge payload for ${payload.platformName}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Payload could not be saved.");
  }
}

async function injectActiveTab(): Promise<void> {
  try {
    const payload = parsePayload();
    const callbackUrl = callbackUrlInput?.value.trim() || defaultCallbackUrl;
    const tabId = await getActiveTabId();
    const response = await sendTabMessage<InjectionResponse>(tabId, {
      type: "ENTITYMANAGER_INJECT_CAPTCHA",
      payload
    } satisfies InjectCaptchaMessage);
    const report: InjectionReport = {
      queueId: payload.queueId,
      accountId: payload.accountId,
      injector: "browser_extension",
      success: response.success,
      evidenceUrl: response.evidenceUrl,
      message: response.message
    };

    const callbackResponse = await sendRuntimeMessage<{ success: boolean; message: string }>({
      type: "ENTITYMANAGER_REPORT_INJECTION",
      report,
      callbackUrl
    });

    setStatus(`${response.message}\n${callbackResponse.message}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "CAPTCHA injection failed.");
  }
}

async function submitVerifyActiveTab(): Promise<void> {
  try {
    const payload = await fetchSubmitVerifyPayload();
    const tabId = await getActiveTabId();
    const response = await sendTabMessage<SubmitVerifyResponse>(tabId, {
      type: "ENTITYMANAGER_SUBMIT_VERIFY",
      payload
    } satisfies SubmitVerifyMessage);
    const report: SubmitVerifyReport = {
      queueId: payload.queueId,
      accountId: payload.accountId,
      success: response.success,
      evidenceUrl: response.evidenceUrl,
      message: `${response.message}${response.filledFields.length ? ` Filled: ${response.filledFields.join(", ")}.` : ""}${response.missingFields.length ? ` Missing: ${response.missingFields.join(", ")}.` : ""}${response.clickedSelector ? ` Selector: ${response.clickedSelector}.` : ""}`
    };
    const callbackUrl = submitCallbackUrlInput?.value.trim() || defaultSubmitCallbackUrl;
    const callbackResponse = await sendRuntimeMessage<{ success: boolean; message: string }>({
      type: "ENTITYMANAGER_REPORT_SUBMIT_VERIFY",
      report,
      callbackUrl
    });

    setStatus(`${response.message}\n${callbackResponse.message}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Submit/verify automation failed.");
  }
}

async function previewSubmitVerifyActiveTab(): Promise<void> {
  try {
    const payload = await fetchSubmitVerifyPayload();
    const tabId = await getActiveTabId();
    const response = await sendTabMessage<SubmitVerifyResponse>(tabId, {
      type: "ENTITYMANAGER_SUBMIT_VERIFY",
      payload,
      dryRun: true
    } satisfies SubmitVerifyMessage);

    setStatus([
      response.message,
      `Planned fill: ${response.plannedFields.join(", ") || "none"}`,
      `Planned click: ${response.plannedSelector || "none"}`,
      `Missing: ${response.missingFields.join(", ") || "none"}`
    ].join("\n"));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Dry-run preview failed.");
  }
}

async function fetchSubmitVerifyPayload(): Promise<AccountSubmitVerifyPayload> {
  const submitFetchUrl = submitFetchUrlInput?.value.trim() || defaultSubmitFetchUrl;
  const response = await fetch(submitFetchUrl, { method: "GET" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Desktop did not return a submit/verify payload.");
  }

  const payload = validateSubmitVerifyPayload(data as Partial<AccountSubmitVerifyPayload>);
  await storageSet({
    submitVerifyPayload: payload,
    submitFetchUrl,
    submitCallbackUrl: submitCallbackUrlInput?.value.trim() || defaultSubmitCallbackUrl
  });

  return payload;
}

function parsePayload(): CaptchaInjectionPayload {
  if (!payloadInput?.value.trim()) {
    throw new Error("Paste a Bridge Payload JSON first.");
  }

  const parsed = JSON.parse(payloadInput.value) as Partial<CaptchaInjectionPayload>;
  return validatePayload(parsed);
}

function validatePayload(parsed: Partial<CaptchaInjectionPayload>): CaptchaInjectionPayload {
  const requiredFields: Array<keyof CaptchaInjectionPayload> = ["queueId", "accountId", "solutionToken", "tokenField", "action"];

  for (const field of requiredFields) {
    if (!parsed[field]) {
      throw new Error(`Bridge payload is missing ${String(field)}.`);
    }
  }

  if (parsed.action !== "inject_recaptcha_token") {
    throw new Error("Bridge payload action must be inject_recaptcha_token.");
  }

  return parsed as CaptchaInjectionPayload;
}

function validateSubmitVerifyPayload(parsed: Partial<AccountSubmitVerifyPayload>): AccountSubmitVerifyPayload {
  const requiredFields: Array<keyof AccountSubmitVerifyPayload> = ["queueId", "accountId", "platformName", "action"];

  for (const field of requiredFields) {
    if (!parsed[field]) {
      throw new Error(`Submit/verify payload is missing ${String(field)}.`);
    }
  }

  if (parsed.action !== "submit_or_verify_account") {
    throw new Error("Submit/verify payload action must be submit_or_verify_account.");
  }

  return {
    ...parsed,
    formValues: parsed.formValues || {
      username: "",
      email: "",
      displayName: "",
      bio: "",
      websiteUrl: ""
    },
    fieldSelectors: parsed.fieldSelectors || {
      username: [],
      email: [],
      displayName: [],
      bio: [],
      websiteUrl: []
    },
    requiredFields: parsed.requiredFields || ["username", "email", "displayName", "bio", "websiteUrl"],
    requiresCaptchaToken: parsed.requiresCaptchaToken ?? true,
    submitSelectors: parsed.submitSelectors || [],
    verifySelectors: parsed.verifySelectors || [],
    evidenceCapture: parsed.evidenceCapture || "current_url",
    notes: parsed.notes || ""
  } as AccountSubmitVerifyPayload;
}

function getActiveTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;

      if (!tabId) {
        reject(new Error("No active tab found."));
        return;
      }

      resolve(tabId);
    });
  });
}

function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Tab message failed."));
        return;
      }

      resolve(response as T);
    });
  });
}

function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Runtime message failed."));
        return;
      }

      resolve(response as T);
    });
  });
}

function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(value: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, resolve);
  });
}

function setStatus(message: string): void {
  if (statusOutput) {
    statusOutput.textContent = message;
  }
}
