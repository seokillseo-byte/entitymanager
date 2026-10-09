import type { AccountSubmitVerifyPayload, CaptchaInjectionPayload, InjectCaptchaMessage, InjectionResponse, SubmitVerifyMessage, SubmitVerifyResponse } from "./types";

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
  const typedMessage = message as Partial<InjectCaptchaMessage | SubmitVerifyMessage>;

  if (typedMessage.type === "ENTITYMANAGER_INJECT_CAPTCHA" && typedMessage.payload) {
    const result = injectCaptchaToken(typedMessage.payload as CaptchaInjectionPayload);
    sendResponse(result);
    return true;
  }

  if (typedMessage.type === "ENTITYMANAGER_SUBMIT_VERIFY" && typedMessage.payload) {
    const result = submitOrVerifyAccount(typedMessage.payload as AccountSubmitVerifyPayload);
    sendResponse(result);
    return true;
  }

  {
    return false;
  }
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

function submitOrVerifyAccount(payload: AccountSubmitVerifyPayload): SubmitVerifyResponse {
  const filledFields = fillFormValues(payload);
  const missingFields = findMissingRequiredFields(payload);

  if (missingFields.length > 0) {
    return {
      success: false,
      evidenceUrl: window.location.href,
      clickedSelector: "",
      filledFields,
      missingFields,
      message: `Pre-submit safety check blocked ${payload.platformName}. Missing: ${missingFields.join(", ")}.`
    };
  }

  const selectors = [...payload.verifySelectors, ...payload.submitSelectors];
  const button = findClickableElement(selectors);

  if (!button) {
    return {
      success: false,
      evidenceUrl: window.location.href,
      clickedSelector: "",
      filledFields,
      missingFields: ["submitButton"],
      message: `No submit/verify element found for ${payload.platformName}.`
    };
  }

  const selector = button.getAttribute("data-entitymanager-selector") || "";
  button.scrollIntoView({ block: "center", inline: "center" });
  button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  button.click();

  window.dispatchEvent(new CustomEvent("entitymanager:submit-verify-clicked", {
    detail: {
      queueId: payload.queueId,
      accountId: payload.accountId,
      platformName: payload.platformName,
      selector
    }
  }));

  return {
    success: true,
    evidenceUrl: window.location.href,
    clickedSelector: selector,
    filledFields,
    missingFields: [],
    message: `Clicked submit/verify element for ${payload.platformName}.`
  };
}

function fillFormValues(payload: AccountSubmitVerifyPayload): string[] {
  const filledFields: string[] = [];
  const entries: Array<[keyof AccountSubmitVerifyPayload["formValues"], string[], string]> = [
    ["username", payload.fieldSelectors.username, payload.formValues.username],
    ["email", payload.fieldSelectors.email, payload.formValues.email],
    ["displayName", payload.fieldSelectors.displayName, payload.formValues.displayName],
    ["bio", payload.fieldSelectors.bio, payload.formValues.bio],
    ["websiteUrl", payload.fieldSelectors.websiteUrl, payload.formValues.websiteUrl]
  ];

  for (const [fieldName, selectors, value] of entries) {
    if (!value.trim()) {
      continue;
    }

    const field = findFillableField(selectors);

    if (!field) {
      continue;
    }

    field.focus();
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    filledFields.push(fieldName);
  }

  return filledFields;
}

function findMissingRequiredFields(payload: AccountSubmitVerifyPayload): string[] {
  const missing: string[] = [];

  for (const fieldName of payload.requiredFields) {
    const value = payload.formValues[fieldName];
    const selectors = payload.fieldSelectors[fieldName];

    if (!value?.trim()) {
      missing.push(`${fieldName}:value`);
      continue;
    }

    const field = findFillableField(selectors);

    if (!field) {
      missing.push(`${fieldName}:selector`);
      continue;
    }

    if (!field.value.trim()) {
      missing.push(`${fieldName}:field`);
    }
  }

  if (payload.requiresCaptchaToken && findTokenFields("g-recaptcha-response").length === 0) {
    missing.push("captchaToken");
  }

  return missing;
}

function findFillableField(selectors: string[]): HTMLInputElement | HTMLTextAreaElement | null {
  for (const selector of selectors) {
    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector));
    const field = fields.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const disabled = candidate.hasAttribute("disabled") || candidate.getAttribute("aria-disabled") === "true" || candidate.readOnly;
      const style = window.getComputedStyle(candidate);

      return !disabled && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });

    if (field) {
      return field;
    }
  }

  return null;
}

function findClickableElement(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const element = elements.find((candidate) => isClickable(candidate));

    if (element) {
      element.setAttribute("data-entitymanager-selector", selector);
      return element;
    }
  }

  const textMatches = Array.from(document.querySelectorAll<HTMLElement>("button, input[type='submit'], a[role='button']"));
  const fallback = textMatches.find((candidate) => {
    const text = `${candidate.innerText || ""} ${(candidate as HTMLInputElement).value || ""} ${candidate.getAttribute("aria-label") || ""}`.toLowerCase();
    return isClickable(candidate) && ["submit", "sign up", "continue", "verify", "confirm", "create account"].some((label) => text.includes(label));
  });

  if (fallback) {
    fallback.setAttribute("data-entitymanager-selector", "text-fallback");
  }

  return fallback || null;
}

function isClickable(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
  const style = window.getComputedStyle(element);

  return !disabled && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
