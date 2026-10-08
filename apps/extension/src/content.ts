import type { CaptchaInjectionPayload, InjectCaptchaMessage, InjectionResponse } from "./types";

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
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const typedMessage = message as Partial<InjectCaptchaMessage>;

  if (typedMessage.type !== "ENTITYMANAGER_INJECT_CAPTCHA" || !typedMessage.payload) {
    return false;
  }

  const result = injectCaptchaToken(typedMessage.payload);
  sendResponse(result);

  return true;
});

function injectCaptchaToken(payload: CaptchaInjectionPayload): InjectionResponse {
  const tokenField = payload.tokenField || "g-recaptcha-response";
  const fields = findTokenFields(tokenField);

  if (fields.length === 0) {
    return {
      success: false,
      evidenceUrl: window.location.href,
      message: `No CAPTCHA token field found for ${tokenField}.`
    };
  }

  for (const field of fields) {
    field.value = payload.solutionToken;
    field.textContent = payload.solutionToken;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  window.dispatchEvent(new CustomEvent("entitymanager:captcha-token-injected", {
    detail: {
      queueId: payload.queueId,
      accountId: payload.accountId,
      tokenField,
      injectedFields: fields.length
    }
  }));

  return {
    success: true,
    evidenceUrl: window.location.href,
    message: `Injected CAPTCHA token into ${fields.length} field(s).`
  };
}

function findTokenFields(tokenField: string): Array<HTMLInputElement | HTMLTextAreaElement> {
  const selectors = [
    `textarea[name="${cssEscape(tokenField)}"]`,
    `input[name="${cssEscape(tokenField)}"]`,
    `textarea[id="${cssEscape(tokenField)}"]`,
    `input[id="${cssEscape(tokenField)}"]`,
    "textarea[name='g-recaptcha-response']",
    "textarea#g-recaptcha-response"
  ];
  const fields = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector)));

  return Array.from(new Set(fields));
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
