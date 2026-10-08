import type { BridgeStorage, CaptchaInjectionPayload, InjectCaptchaMessage, InjectionReport, InjectionResponse } from "./types";

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
const callbackUrlInput = document.querySelector<HTMLInputElement>("#callbackUrlInput");
const savePayloadButton = document.querySelector<HTMLButtonElement>("#savePayloadButton");
const injectButton = document.querySelector<HTMLButtonElement>("#injectButton");
const statusOutput = document.querySelector<HTMLPreElement>("#statusOutput");

const defaultCallbackUrl = "http://127.0.0.1:17321/captcha/injection/complete";

void loadState();

savePayloadButton?.addEventListener("click", () => {
  void savePayload();
});

injectButton?.addEventListener("click", () => {
  void injectActiveTab();
});

async function loadState(): Promise<void> {
  const state = await storageGet(["captchaPayload", "callbackUrl"]);
  const bridgeState = state as BridgeStorage;

  if (payloadInput && bridgeState.captchaPayload) {
    payloadInput.value = JSON.stringify(bridgeState.captchaPayload, null, 2);
  }

  if (callbackUrlInput) {
    callbackUrlInput.value = bridgeState.callbackUrl || defaultCallbackUrl;
  }
}

async function savePayload(): Promise<void> {
  try {
    const payload = parsePayload();
    const callbackUrl = callbackUrlInput?.value.trim() || defaultCallbackUrl;
    await storageSet({ captchaPayload: payload, callbackUrl });
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

function parsePayload(): CaptchaInjectionPayload {
  if (!payloadInput?.value.trim()) {
    throw new Error("Paste a Bridge Payload JSON first.");
  }

  const parsed = JSON.parse(payloadInput.value) as Partial<CaptchaInjectionPayload>;
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
