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
  const typedMessage = message as { type?: string; payload?: unknown; dryRun?: boolean; fillOnly?: boolean; email?: string; displayName?: string };

  if (typedMessage.type === "ENTITYMANAGER_MEDIUM_SIGNUP") {
    void automateMediumEmailSignup(typedMessage.email || "", typedMessage.displayName || "").then(sendResponse);
    return true;
  }

  if (typedMessage.type === "ENTITYMANAGER_INJECT_CAPTCHA" && typedMessage.payload) {
    const result = injectCaptchaToken(typedMessage.payload as CaptchaInjectionPayload);
    sendResponse(result);
    return true;
  }

  if (typedMessage.type === "ENTITYMANAGER_SUBMIT_VERIFY" && typedMessage.payload) {
    const result = submitOrVerifyAccount(
      typedMessage.payload as AccountSubmitVerifyPayload,
      Boolean(typedMessage.dryRun),
      Boolean(typedMessage.fillOnly)
    );
    sendResponse(result);
    return true;
  }

  {
    return false;
  }
});

async function automateMediumEmailSignup(email: string, displayName: string): Promise<{ success: boolean; waitingForVerification: boolean; message: string }> {
  if (!email.trim()) return { success: false, waitingForVerification: false, message: "Entity Profile chưa có email để đăng ký Medium." };
  if (!displayName.trim()) return { success: false, waitingForVerification: false, message: "Entity Profile chưa có Display Name để điền ô Your full name của Medium." };
  const visible = (element: Element) => {
    const node = element as HTMLElement;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  let emailInput = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='email'], input[name='email'], input[autocomplete='email']")).find(visible);
  if (!emailInput) {
    const choice = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']")).filter(visible)
      .find((element) => /sign up with email|continue with email|email/i.test((element.innerText || element.textContent || "").trim()));
    choice?.click();
    if (choice) await new Promise((resolve) => setTimeout(resolve, 900));
    emailInput = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='email'], input[name='email'], input[autocomplete='email']")).find(visible);
  }
  if (!emailInput) return { success: false, waitingForVerification: false, message: "Không tìm thấy ô email Medium sau khi mở phương thức đăng ký email." };
  const nameInput = findMediumFullNameInput(visible);
  if (!nameInput) return { success: false, waitingForVerification: false, message: "Không tìm thấy ô Your full name của Medium; chưa bấm Create account." };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setControlledInputValue(nameInput, displayName, setter);
  setControlledInputValue(emailInput, email, setter);
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (!nameInput.value.trim() || !emailInput.value.trim()) {
    return { success: false, waitingForVerification: false, message: "Medium chưa ghi nhận đủ Full name và Email; chưa bấm Create account." };
  }
  const submit = Array.from(document.querySelectorAll<HTMLButtonElement>("button[type='submit'], button")).filter(visible)
    .find((button) => /continue|sign up|create account|send|email/i.test((button.innerText || button.textContent || "").trim()) && !button.disabled);
  if (!submit) return { success: false, waitingForVerification: false, message: `Đã điền ${displayName} và ${email}, nhưng chưa tìm thấy nút Create account phù hợp.` };
  submit.click();
  return { success: true, waitingForVerification: true, message: `Đã điền Full name (${displayName}), email (${email}) và bấm Create account; đang chờ Medium xác minh email.` };
}

function findMediumFullNameInput(visible: (element: Element) => boolean): HTMLInputElement | undefined {
  const candidates = Array.from(document.querySelectorAll<HTMLInputElement>(
    "input[name='name'], input[name='fullName'], input[name='fullname'], input[autocomplete='name'], input[type='text']"
  )).filter(visible);
  return candidates.find((input) => {
    const label = input.labels?.[0]?.textContent || "";
    const descriptor = [input.name, input.id, input.placeholder, input.getAttribute("aria-label"), label].filter(Boolean).join(" ");
    return /full\s*name|your\s*name|display\s*name|^name$/i.test(descriptor.trim());
  }) || candidates.find((input) => input.type === "text");
}

function setControlledInputValue(input: HTMLInputElement, value: string, setter?: (this: HTMLInputElement, value: string) => void): void {
  input.focus();
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

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

function submitOrVerifyAccount(payload: AccountSubmitVerifyPayload, dryRun: boolean, fillOnly: boolean): SubmitVerifyResponse {
  const plannedFields = previewFillableFields(payload);
  const plannedButton = findClickableElement([...payload.verifySelectors, ...payload.submitSelectors]);
  const plannedSelector = plannedButton?.getAttribute("data-entitymanager-selector") || "";
  const filledFields = dryRun ? [] : fillFormValues(payload);
  const missingFields = findMissingRequiredFields(payload, dryRun);

  if (dryRun) {
    return {
      success: missingFields.length === 0 && Boolean(plannedSelector),
      evidenceUrl: window.location.href,
      clickedSelector: "",
      filledFields,
      missingFields: plannedSelector ? missingFields : [...missingFields, "submitButton"],
      plannedFields,
      plannedSelector,
      message: `Dry-run preview for ${payload.platformName}: would fill ${plannedFields.join(", ") || "no fields"}; would click ${plannedSelector || "nothing"}.`
    };
  }

  if (fillOnly) {
    return {
      success: missingFields.length === 0,
      evidenceUrl: window.location.href,
      clickedSelector: "",
      filledFields,
      missingFields,
      plannedFields,
      plannedSelector,
      message: `Safe fill preview for ${payload.platformName}: filled ${filledFields.join(", ") || "no fields"} and did not submit.`
    };
  }

  if (missingFields.length > 0) {
    return {
      success: false,
      evidenceUrl: window.location.href,
      clickedSelector: "",
      filledFields,
      missingFields,
      plannedFields,
      plannedSelector,
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
      plannedFields,
      plannedSelector,
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
    plannedFields,
    plannedSelector: selector,
    message: `Clicked submit/verify element for ${payload.platformName}.`
  };
}

function previewFillableFields(payload: AccountSubmitVerifyPayload): string[] {
  return formValueEntries(payload)
    .filter(([, selectors, value]) => value.trim() && findFillableField(selectors))
    .map(([fieldName]) => fieldName);
}

function fillFormValues(payload: AccountSubmitVerifyPayload): string[] {
  const filledFields: string[] = [];

  for (const [fieldName, selectors, value] of formValueEntries(payload)) {
    if (!value.trim()) {
      continue;
    }

    if (fieldName === "socialLinks") {
      const links = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      const fields = findFillableFields(selectors).filter((field) => field.type !== "file");

      fields.slice(0, links.length).forEach((field, index) => {
        field.focus();
        field.value = links[index];
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });

      if (fields.length > 0 && links.length > 0) {
        filledFields.push(fieldName);
      }
      continue;
    }

    const field = findFillableField(selectors);

    if (!field) {
      continue;
    }

    if (field.type === "file") {
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

function formValueEntries(payload: AccountSubmitVerifyPayload): Array<[keyof AccountSubmitVerifyPayload["formValues"], string[], string]> {
  return [
    ["username", payload.fieldSelectors.username, payload.formValues.username],
    ["email", payload.fieldSelectors.email, payload.formValues.email],
    ["displayName", payload.fieldSelectors.displayName, payload.formValues.displayName],
    ["bio", payload.fieldSelectors.bio, payload.formValues.bio],
    ["websiteUrl", payload.fieldSelectors.websiteUrl, payload.formValues.websiteUrl],
    ["company", payload.fieldSelectors.company, payload.formValues.company],
    ["location", payload.fieldSelectors.location, payload.formValues.location],
    ["socialLinks", payload.fieldSelectors.socialLinks, payload.formValues.socialLinks],
    ["profileImage", payload.fieldSelectors.profileImage, payload.formValues.profileImage],
    ["avatarImageUrl", payload.fieldSelectors.avatarImageUrl, payload.formValues.avatarImageUrl],
    ["bannerImageUrl", payload.fieldSelectors.bannerImageUrl, payload.formValues.bannerImageUrl]
  ];
}

function findMissingRequiredFields(payload: AccountSubmitVerifyPayload, assumeFill: boolean): string[] {
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

    if (!assumeFill && !field.value.trim()) {
      missing.push(`${fieldName}:field`);
    }
  }

  if (payload.requiresCaptchaToken && findTokenFields("g-recaptcha-response").length === 0) {
    missing.push("captchaToken");
  }

  return missing;
}

function findFillableField(selectors: string[]): HTMLInputElement | HTMLTextAreaElement | null {
  return findFillableFields(selectors)[0] || null;
}

function findFillableFields(selectors: string[]): Array<HTMLInputElement | HTMLTextAreaElement> {
  const results: Array<HTMLInputElement | HTMLTextAreaElement> = [];

  for (const selector of selectors) {
    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector));
    const visibleFields = fields.filter((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const disabled = candidate.hasAttribute("disabled") || candidate.getAttribute("aria-disabled") === "true" || candidate.readOnly;
      const style = window.getComputedStyle(candidate);

      return !disabled && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });

    results.push(...visibleFields);
  }

  return Array.from(new Set(results));
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
