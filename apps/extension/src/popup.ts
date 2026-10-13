import type { AccountSubmitVerifyPayload, BridgeStorage, CaptchaInjectionPayload, DryRunHistoryReport, InjectCaptchaMessage, InjectionReport, InjectionResponse, SubmitVerifyMessage, SubmitVerifyReport, SubmitVerifyResponse } from "./types";

declare const chrome: {
  runtime: {
    lastError?: { message?: string };
    sendMessage(message: unknown, callback?: (response: unknown) => void): void;
  };
  tabs: {
    query(queryInfo: { active: boolean; currentWindow: boolean }, callback: (tabs: Array<{ id?: number; url?: string }>) => void): void;
    sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void): void;
  };
  scripting: {
    executeScript<T = unknown>(details: {
      target: { tabId: number };
      files?: string[];
      func?: (payload: AccountSubmitVerifyPayload) => T | Promise<T>;
      args?: unknown[];
    }, callback?: (results?: Array<{ result?: T }>) => void): void;
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
const fillPreviewButton = document.querySelector<HTMLButtonElement>("#fillPreviewButton");
const submitVerifyButton = document.querySelector<HTMLButtonElement>("#submitVerifyButton");
const statusOutput = document.querySelector<HTMLPreElement>("#statusOutput");

const defaultFetchUrl = "http://127.0.0.1:17321/captcha/injection/next";
const defaultCallbackUrl = "http://127.0.0.1:17321/captcha/injection/complete";
const defaultSubmitFetchUrl = "http://127.0.0.1:17321/account/submit-verify/next";
const defaultDryRunPreviewUrl = "http://127.0.0.1:17321/account/submit-verify/preview";
const defaultSubmitCallbackUrl = "http://127.0.0.1:17321/account/submit-verify/complete";
const defaultDryRunHistoryCallbackUrl = "http://127.0.0.1:17321/account/submit-verify/dry-run-history";

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

fillPreviewButton?.addEventListener("click", () => {
  void fillPreviewActiveTab();
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

async function fillPreviewActiveTab(): Promise<void> {
  try {
    const currentUrl = await getActiveTabUrl();
    const payload = await prepareSafeFillPayload(await fetchDryRunPreviewPayload(currentUrl), currentUrl);
    const tabId = await getActiveTabId();
    const response = await runSafeFillInPage(tabId, payload);

    setStatus([
      response.message,
      `Filled: ${response.filledFields.join(", ") || "none"}`,
      `Not submitted: yes`,
      `Needs attention: ${response.missingFields.join(", ") || "none"}`
    ].join("\n"));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Safe fill preview failed.");
  }
}

async function runSafeFillInPage(tabId: number, payload: AccountSubmitVerifyPayload): Promise<SubmitVerifyResponse> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript<SubmitVerifyResponse>({
      target: { tabId },
      args: [payload],
      func: async (pagePayload) => {
        const isVisible = (element: Element): boolean => {
          const candidate = element as HTMLElement;
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const isGithubProfilePage = (): boolean => location.hostname === "github.com" && location.pathname === "/settings/profile";
        const findGithubProfileUrlFields = (): HTMLInputElement[] => {
          const direct = document.querySelector<HTMLInputElement>("input[name='user[profile_blog]'], input[id='user_profile_blog']");
          if (direct && !direct.disabled && !direct.readOnly && isVisible(direct)) {
            return [direct];
          }

          const label = Array.from(document.querySelectorAll<HTMLElement>("label"))
            .find((candidate) => candidate.textContent?.trim().toLowerCase() === "url");
          if (label) {
            const labelRect = label.getBoundingClientRect();
            const geometric = Array.from(document.querySelectorAll<HTMLInputElement>("input:not([type='file'])"))
              .filter((candidate) => !candidate.disabled && !candidate.readOnly && isVisible(candidate))
              .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
              .filter(({ rect }) => rect.top >= labelRect.bottom - 8 && rect.top <= labelRect.bottom + 80 && Math.abs(rect.left - labelRect.left) < 80)
              .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)[0]?.candidate;
            if (geometric) return [geometric];
          }

          const visibleTextInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input:not([type='file'])"))
            .filter((candidate) => !candidate.disabled && !candidate.readOnly && isVisible(candidate));
          const bio = document.querySelector<HTMLTextAreaElement>("textarea[name='user[profile_bio]'], textarea[id='user_profile_bio']");
          const social = visibleTextInputs.find((candidate) => {
            const text = `${candidate.name} ${candidate.id} ${candidate.placeholder}`.toLowerCase();
            return text.includes("social") || text.includes("link to social profile");
          });
          const bioBottom = bio?.getBoundingClientRect().bottom ?? 0;
          const socialTop = social?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
          return visibleTextInputs
            .filter((candidate) => {
              const rect = candidate.getBoundingClientRect();
              const text = `${candidate.name} ${candidate.id} ${candidate.placeholder} ${candidate.getAttribute("aria-label") || ""}`.toLowerCase();
              return rect.top > bioBottom && rect.top < socialTop && !text.includes("social") && !text.includes("company") && !text.includes("location") && !text.includes("email");
            })
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            .slice(0, 1);
        };
        const findByNearbyText = (fieldName: keyof AccountSubmitVerifyPayload["formValues"], includeFile = false): Array<HTMLInputElement | HTMLTextAreaElement> => {
          const labels: Record<string, string[]> = {
            websiteUrl: ["url", "website", "blog"],
            avatarImageUrl: ["avatar", "profile picture", "profile photo", "photo", "image"],
            profileImage: ["avatar", "profile picture", "profile photo", "photo", "image"],
            bannerImageUrl: ["banner", "cover", "header"],
            company: ["company", "organization"],
            location: ["location", "address"]
          };
          const wanted = labels[fieldName] || [];
          if (wanted.length === 0) return [];
          if (fieldName === "websiteUrl" && isGithubProfilePage()) {
            return findGithubProfileUrlFields();
          }
          return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
            .filter((candidate) => {
              const usable = !candidate.disabled && !candidate.readOnly && (includeFile || candidate.type !== "file");
              const visibleEnough = includeFile && candidate.type === "file" ? true : isVisible(candidate);
              if (!usable || !visibleEnough) return false;
              const labelText = Array.from(document.querySelectorAll<HTMLLabelElement>("label"))
                .filter((label) => label.control === candidate || label.contains(candidate))
                .map((label) => label.innerText)
                .join(" ");
              const context = [
                candidate.name,
                candidate.id,
                candidate.type,
                candidate.placeholder,
                candidate.getAttribute("aria-label") || "",
                labelText,
                candidate.parentElement?.innerText || "",
                candidate.parentElement?.previousElementSibling?.textContent || ""
              ].join(" ").toLowerCase();
              return wanted.some((word) => context.includes(word));
            });
        };
        const findFields = (selectors: string[], includeFile = false, fieldName?: keyof AccountSubmitVerifyPayload["formValues"]): Array<HTMLInputElement | HTMLTextAreaElement> => {
          if (fieldName === "websiteUrl" && isGithubProfilePage()) {
            return findGithubProfileUrlFields();
          }
          const fields: Array<HTMLInputElement | HTMLTextAreaElement> = [];
          for (const selector of selectors) {
            try {
              fields.push(...Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector))
                .filter((candidate) => {
                  const usable = !candidate.disabled && !candidate.readOnly && (includeFile || candidate.type !== "file");
                  const visibleEnough = includeFile && candidate.type === "file" ? true : isVisible(candidate);
                  return usable && visibleEnough;
                }));
            } catch {
              // Ignore malformed selectors and continue with the remaining candidates.
            }
          }
          if (fields.length === 0 && fieldName) {
            fields.push(...findByNearbyText(fieldName, includeFile));
          }
          return Array.from(new Set(fields));
        };
        const setFieldValue = (field: HTMLInputElement | HTMLTextAreaElement, nextValue: string): void => {
          const prototype = Object.getPrototypeOf(field) as HTMLInputElement | HTMLTextAreaElement;
          const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
          if (descriptor?.set) {
            descriptor.set.call(field, nextValue);
          } else {
            field.value = nextValue;
          }
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const blobFromImageValue = async (imageValue: string): Promise<Blob | null> => {
          if (imageValue.startsWith("data:")) {
            const parts = imageValue.split(",");
            if (parts.length < 2) return null;
            const header = parts[0] || "";
            const mime = header.match(/^data:([^;]+)/)?.[1] || "image/jpeg";
            const binary = atob(parts.slice(1).join(","));
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            return new Blob([bytes], { type: mime });
          }

          const response = await fetch(imageValue, { mode: "cors" });
          if (!response.ok) return null;
          return response.blob();
        };
        const fieldEntries: Array<[keyof AccountSubmitVerifyPayload["formValues"], string[], string]> = [
          ["username", pagePayload.fieldSelectors.username, pagePayload.formValues.username],
          ["email", pagePayload.fieldSelectors.email, pagePayload.formValues.email],
          ["displayName", pagePayload.fieldSelectors.displayName, pagePayload.formValues.displayName],
          ["bio", pagePayload.fieldSelectors.bio, pagePayload.formValues.bio],
          ["websiteUrl", pagePayload.fieldSelectors.websiteUrl, pagePayload.formValues.websiteUrl],
          ["company", pagePayload.fieldSelectors.company, pagePayload.formValues.company],
          ["location", pagePayload.fieldSelectors.location, pagePayload.formValues.location],
          ["socialLinks", pagePayload.fieldSelectors.socialLinks, pagePayload.formValues.socialLinks],
          ["profileImage", pagePayload.fieldSelectors.profileImage, pagePayload.formValues.profileImage],
          ["avatarImageUrl", pagePayload.fieldSelectors.avatarImageUrl, pagePayload.formValues.avatarImageUrl],
          ["bannerImageUrl", pagePayload.fieldSelectors.bannerImageUrl, pagePayload.formValues.bannerImageUrl]
        ];
        const plannedFields = fieldEntries
          .filter(([fieldName, selectors, value]) => Boolean(value.trim()) && findFields(selectors, fieldName === "profileImage" || fieldName === "avatarImageUrl" || fieldName === "bannerImageUrl", fieldName).length > 0)
          .map(([name]) => name);
        const filledFields: string[] = [];
        const attentionFields: string[] = [];
        for (const [fieldName, selectors, value] of fieldEntries) {
          if (!value.trim()) continue;
          const isImageField = fieldName === "profileImage" || fieldName === "avatarImageUrl" || fieldName === "bannerImageUrl";
          let fields = findFields(selectors, isImageField, fieldName);
          if (fields.length === 0 && (fieldName === "profileImage" || fieldName === "avatarImageUrl")) {
            const editButton = Array.from(document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a[role='button']"))
              .find((candidate) => {
                const text = `${candidate.innerText || ""} ${candidate.getAttribute("aria-label") || ""}`.toLowerCase();
                return isVisible(candidate) && (text.includes("edit") || text.includes("photo") || text.includes("picture") || text.includes("avatar"));
              });
            editButton?.click();
            await new Promise((resolve) => setTimeout(resolve, 800));
            fields = findFields(selectors, isImageField, fieldName);
            if (fields.length === 0 && location.hostname === "github.com" && location.pathname === "/settings/profile") {
              fields = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']"))
                .filter((candidate) => {
                  const context = `${candidate.name} ${candidate.id} ${candidate.accept} ${candidate.getAttribute("aria-label") || ""}`.toLowerCase();
                  return !candidate.disabled && (context.includes("image") || context.includes("photo") || context.includes("picture") || context.includes("avatar") || candidate.accept.includes("image"));
                });
              if (fields.length === 0) {
                const uploadButton = Array.from(document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a[role='menuitem'], a[role='button']"))
                  .find((candidate) => {
                    const text = `${candidate.innerText || ""} ${candidate.getAttribute("aria-label") || ""}`.toLowerCase();
                    return isVisible(candidate) && (text.includes("upload") || text.includes("photo") || text.includes("picture"));
                  });
                if (uploadButton) {
                  attentionFields.push(`${fieldName}:manual_file_picker`);
                } else {
                  attentionFields.push(`${fieldName}:manual_upload_control`);
                }
              }
            }
          }
          if (fields.length === 0) {
            if (isImageField && !attentionFields.some((item) => item.startsWith(`${fieldName}:`))) {
              attentionFields.push(`${fieldName}:upload_control_not_found`);
            }
            continue;
          }

          if (fieldName === "socialLinks") {
            const links = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
            fields.slice(0, links.length).forEach((field, index) => {
              field.focus();
              setFieldValue(field, links[index]);
            });
            if (links.length > 0) filledFields.push(fieldName);
            continue;
          }

          if (isImageField) {
            const fileField = fields.find((field) => field.type === "file") as HTMLInputElement | undefined;
            if (!fileField) {
              attentionFields.push(`${fieldName}:manual_upload_control`);
              continue;
            }
            try {
              const blob = await blobFromImageValue(value);
              if (!blob) {
                attentionFields.push(`${fieldName}:image_fetch_failed`);
                continue;
              }
              const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
              const filename = fieldName === "bannerImageUrl" ? `entity-banner-1200x630.${extension}` : `entity-avatar.${extension}`;
              const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
              const transfer = new DataTransfer();
              transfer.items.add(file);
              fileField.files = transfer.files;
              fileField.dispatchEvent(new Event("input", { bubbles: true }));
              fileField.dispatchEvent(new Event("change", { bubbles: true }));
              filledFields.push(fieldName);
            } catch {
              attentionFields.push(`${fieldName}:manual_or_blocked_image_upload`);
            }
            continue;
          }

          const field = fields[0];
          field.focus();
          setFieldValue(field, value);
          if (field.value === value) {
            filledFields.push(fieldName);
          }
        }
        const missingFields: string[] = [...attentionFields];
        for (const fieldName of pagePayload.requiredFields) {
          if (!pagePayload.formValues[fieldName]?.trim()) {
            missingFields.push(`${fieldName}:value`);
          } else if (!findFields(pagePayload.fieldSelectors[fieldName], fieldName === "profileImage" || fieldName === "avatarImageUrl" || fieldName === "bannerImageUrl", fieldName).length) {
            missingFields.push(`${fieldName}:selector`);
          }
        }

        return {
          success: missingFields.length === 0,
          evidenceUrl: window.location.href,
          clickedSelector: "",
          filledFields,
          missingFields,
          plannedFields,
          plannedSelector: "",
          message: `Điền thử an toàn cho ${pagePayload.platformName}: đã điền ${filledFields.join(", ") || "0 trường"} và không bấm gửi.`
        };
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Chrome không thể điền thử trên tab hiện tại. Hãy tải lại trang web rồi thử lại. Chi tiết: ${chrome.runtime.lastError.message || "không rõ nguyên nhân"}`));
        return;
      }
      const result = results?.[0]?.result;
      if (!result) {
        reject(new Error("Chrome không trả kết quả điền thử. Hãy tải lại trang web và thử lại."));
        return;
      }
      resolve(result);
    });
  });
}

async function prepareSafeFillPayload(payload: AccountSubmitVerifyPayload, currentUrl: string): Promise<AccountSubmitVerifyPayload> {
  const nextPayload: AccountSubmitVerifyPayload = {
    ...payload,
    formValues: { ...payload.formValues },
    fieldSelectors: { ...payload.fieldSelectors },
    requiredFields: [...payload.requiredFields]
  };
  const platformId = platformIdForUrl(currentUrl);

  if (platformId === "github") {
    nextPayload.formValues.bannerImageUrl = "";
    nextPayload.fieldSelectors.bannerImageUrl = [];
    nextPayload.requiredFields = nextPayload.requiredFields.filter((field) => field !== "bannerImageUrl");
  }

  const avatarValue = nextPayload.formValues.avatarImageUrl || nextPayload.formValues.profileImage;
  const hydratedAvatar = await hydrateImageValueForPage(avatarValue);
  if (hydratedAvatar) {
    nextPayload.formValues.avatarImageUrl = hydratedAvatar;
    nextPayload.formValues.profileImage = hydratedAvatar;
  }

  const hydratedBanner = await hydrateImageValueForPage(nextPayload.formValues.bannerImageUrl);
  if (hydratedBanner) {
    nextPayload.formValues.bannerImageUrl = hydratedBanner;
  }

  return nextPayload;
}

async function hydrateImageValueForPage(value: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const response = await fetch(trimmed);
    if (!response.ok) return trimmed;
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : trimmed);
      reader.onerror = () => resolve(trimmed);
      reader.readAsDataURL(blob);
    });
  } catch {
    return trimmed;
  }
}

async function previewSubmitVerifyActiveTab(): Promise<void> {
  try {
    const currentUrl = await getActiveTabUrl();
    const payload = await fetchDryRunPreviewPayload(currentUrl);
    const tabId = await getActiveTabId();
    // Dry-run reads the page directly through Chrome's scripting API. This avoids
    // depending on a content-script message listener, which may be missing on older tabs.
    const response = await runDryRunInPage(tabId, payload);
    const report: DryRunHistoryReport = {
      id: `dryrun-${payload.accountId}-${Date.now()}`,
      platformId: payload.platformId,
      platformName: payload.platformName,
      accountId: payload.accountId,
      plannedFields: response.plannedFields,
      plannedSelector: response.plannedSelector,
      missingChecks: response.missingFields,
      currentUrl: currentUrl || response.evidenceUrl,
      createdAt: new Date().toISOString()
    };
    const callback = await sendRuntimeMessage<{ success: boolean; message: string }>({
      type: "ENTITYMANAGER_REPORT_DRY_RUN",
      dryRunReport: report,
      callbackUrl: defaultDryRunHistoryCallbackUrl
    });
    setStatus([
      response.message,
      `Planned fill: ${response.plannedFields.join(", ") || "none"}`,
      `Planned click: ${response.plannedSelector || "none"}`,
      `Missing: ${response.missingFields.join(", ") || "none"}`,
      callback.message
    ].join("\n"));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Dry-run preview failed.");
  }
}

async function runDryRunInPage(tabId: number, payload: AccountSubmitVerifyPayload): Promise<SubmitVerifyResponse> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript<SubmitVerifyResponse>({
      target: { tabId },
      args: [payload],
      func: (pagePayload) => {
        const isVisible = (element: Element): boolean => {
          const candidate = element as HTMLElement;
          const rect = candidate.getBoundingClientRect();
          const style = window.getComputedStyle(candidate);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const findField = (selectors: string[]): HTMLInputElement | HTMLTextAreaElement | null => {
          for (const selector of selectors) {
            try {
              const field = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector))
                .find((candidate) => !candidate.disabled && !candidate.readOnly && isVisible(candidate));
              if (field) return field;
            } catch {
              // Ignore malformed selectors and continue with the remaining candidates.
            }
          }
          return null;
        };
        const fieldEntries: Array<[keyof AccountSubmitVerifyPayload["formValues"], string[], string]> = [
          ["username", pagePayload.fieldSelectors.username, pagePayload.formValues.username],
          ["email", pagePayload.fieldSelectors.email, pagePayload.formValues.email],
          ["displayName", pagePayload.fieldSelectors.displayName, pagePayload.formValues.displayName],
          ["bio", pagePayload.fieldSelectors.bio, pagePayload.formValues.bio],
          ["websiteUrl", pagePayload.fieldSelectors.websiteUrl, pagePayload.formValues.websiteUrl],
          ["company", pagePayload.fieldSelectors.company, pagePayload.formValues.company],
          ["location", pagePayload.fieldSelectors.location, pagePayload.formValues.location],
          ["socialLinks", pagePayload.fieldSelectors.socialLinks, pagePayload.formValues.socialLinks],
          ["profileImage", pagePayload.fieldSelectors.profileImage, pagePayload.formValues.profileImage],
          ["avatarImageUrl", pagePayload.fieldSelectors.avatarImageUrl, pagePayload.formValues.avatarImageUrl],
          ["bannerImageUrl", pagePayload.fieldSelectors.bannerImageUrl, pagePayload.formValues.bannerImageUrl]
        ];
        const plannedFields = fieldEntries
          .filter(([, selectors, value]) => Boolean(value.trim()) && Boolean(findField(selectors)))
          .map(([name]) => name);
        const missingFields: string[] = [];
        for (const fieldName of pagePayload.requiredFields) {
          if (!pagePayload.formValues[fieldName]?.trim()) {
            missingFields.push(`${fieldName}:value`);
          } else if (!findField(pagePayload.fieldSelectors[fieldName])) {
            missingFields.push(`${fieldName}:selector`);
          }
        }
        const buttonSelectors = [...pagePayload.verifySelectors, ...pagePayload.submitSelectors];
        let plannedSelector = "";
        for (const selector of buttonSelectors) {
          try {
            const button = Array.from(document.querySelectorAll<HTMLElement>(selector))
              .find((candidate) => {
                const rect = candidate.getBoundingClientRect();
                const style = window.getComputedStyle(candidate);
                return !candidate.hasAttribute("disabled") &&
                  candidate.getAttribute("aria-disabled") !== "true" &&
                  rect.width > 0 && rect.height > 0 &&
                  style.visibility !== "hidden" && style.display !== "none";
              });
            if (button) { plannedSelector = selector; break; }
          } catch {
            // Ignore malformed selectors.
          }
        }
        if (!plannedSelector) {
          const fallback = Array.from(document.querySelectorAll<HTMLElement>("button, input[type='submit'], a[role='button']"))
            .find((candidate) => {
              const text = `${candidate.innerText || ""} ${(candidate as HTMLInputElement).value || ""} ${candidate.getAttribute("aria-label") || ""}`.toLowerCase();
              const rect = candidate.getBoundingClientRect();
              const style = window.getComputedStyle(candidate);
              return !candidate.hasAttribute("disabled") &&
                candidate.getAttribute("aria-disabled") !== "true" &&
                rect.width > 0 && rect.height > 0 &&
                style.visibility !== "hidden" && style.display !== "none" &&
                ["submit", "sign up", "continue", "verify", "confirm", "create account"].some((label) => text.includes(label));
            });
          if (fallback) plannedSelector = "text-fallback";
        }
        if (!plannedSelector) missingFields.push("submitButton");
        return {
          success: missingFields.length === 0,
          evidenceUrl: window.location.href,
          clickedSelector: "",
          filledFields: [],
          missingFields,
          plannedFields,
          plannedSelector,
          message: `Chạy thử an toàn: dự kiến nhận diện ${plannedFields.join(", ") || "0 trường"}; nút dự kiến: ${plannedSelector || "không tìm thấy"}. Không điền hoặc gửi biểu mẫu.`
        };
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Chrome không thể kiểm tra tab hiện tại. Hãy tải lại trang web rồi thử lại. Chi tiết: ${chrome.runtime.lastError.message || "không rõ nguyên nhân"}`));
        return;
      }
      const result = results?.[0]?.result;
      if (!result) {
        reject(new Error("Chrome không trả kết quả chạy thử. Hãy tải lại trang web và thử lại."));
        return;
      }
      resolve(result);
    });
  });
}

function platformIdForUrl(url: string): string | null {
  let hostname: string;
  let pathname: string;
  try {
    const parsedUrl = new URL(url);
    hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
    pathname = parsedUrl.pathname.toLowerCase();
  } catch {
    return null;
  }

  const platformDomains: Array<[string, string[]]> = [
    ["github", ["github.com"]],
    ["medium", ["medium.com"]],
    ["tumblr", ["tumblr.com"]],
    ["aboutme", ["about.me"]],
    ["pinterest", ["pinterest.com"]],
    ["youtube", ["youtube.com", "youtu.be"]],
    ["slideshare", ["slideshare.net"]],
    ["soundcloud", ["soundcloud.com"]],
    ["crunchbase", ["crunchbase.com"]],
    ["behance", ["behance.net"]],
    ["quora", ["quora.com"]],
    ["google-business-profile", ["business.google.com"]]
  ];

  if (hostname === "google.com" && pathname.startsWith("/business")) {
    return "google-business-profile";
  }

  return platformDomains.find(([, domains]) =>
    domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  )?.[0] ?? null;
}

async function fetchDryRunPreviewPayload(currentUrl: string): Promise<AccountSubmitVerifyPayload> {
  const platformId = platformIdForUrl(currentUrl);
  if (!platformId) {
    throw new Error("Chưa có công thức chạy thử cho tên miền này. Hãy mở trang thuộc một nền tảng đã có trong Platform Library.");
  }
  const response = await fetch(`${defaultDryRunPreviewUrl}?platformId=${encodeURIComponent(platformId)}`, { method: "GET" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Không lấy được dữ liệu chạy thử từ EntityManager Desktop.");
  }
  const payload = validateSubmitVerifyPayload(data as Partial<AccountSubmitVerifyPayload>);
  return { ...payload, requiresCaptchaToken: false };
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

  const defaultFormValues: AccountSubmitVerifyPayload["formValues"] = {
    username: "",
    email: "",
    displayName: "",
    bio: "",
    websiteUrl: "",
    company: "",
    location: "",
    socialLinks: "",
    profileImage: "",
    avatarImageUrl: "",
    bannerImageUrl: ""
  };
  const defaultFieldSelectors: AccountSubmitVerifyPayload["fieldSelectors"] = {
    username: [],
    email: [],
    displayName: [],
    bio: [],
    websiteUrl: [],
    company: [],
    location: [],
    socialLinks: [],
    profileImage: [],
    avatarImageUrl: [],
    bannerImageUrl: []
  };

  return {
    ...parsed,
    formValues: { ...defaultFormValues, ...(parsed.formValues || {}) },
    fieldSelectors: { ...defaultFieldSelectors, ...(parsed.fieldSelectors || {}) },
    requiredFields: parsed.requiredFields || ["username", "email", "displayName", "bio", "websiteUrl"],
    requiresCaptchaToken: parsed.requiresCaptchaToken ?? true,
    submitSelectors: parsed.submitSelectors || [],
    verifySelectors: parsed.verifySelectors || [],
    evidenceCapture: parsed.evidenceCapture || "current_url",
    notes: parsed.notes || ""
  } as AccountSubmitVerifyPayload;
}

function getActiveTabUrl(): Promise<string> {
  return new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]?.url || "")));
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
  return sendTabMessageOnce<T>(tabId, message).catch(async (error: unknown) => {
    const messageText = error instanceof Error ? error.message : String(error);
    if (!/receiving end does not exist|could not establish connection|message port closed/i.test(messageText)) {
      throw error;
    }

    // The tab may have been opened before the extension was installed/reloaded, or
    // Chrome may not have run the declarative content script yet. Inject it once and retry.
    await injectContentScript(tabId);
    return sendTabMessageOnce<T>(tabId, message);
  });
}

function sendTabMessageOnce<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Không kết nối được với nội dung trang."));
        return;
      }

      if (response === undefined || response === null) {
        reject(new Error("Tiện ích đã kết nối nhưng trang không trả về kết quả."));
        return;
      }

      resolve(response as T);
    });
  });
}

function injectContentScript(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
      if (chrome.runtime.lastError) {
        const detail = chrome.runtime.lastError.message || "Chrome không cho phép chạy mã trên tab này.";
        reject(new Error(
          `Không thể kết nối với trang hiện tại. Hãy mở một trang web thông thường (không phải chrome://, trang tiện ích hoặc Chrome Web Store), tải lại trang rồi thử lại. Chi tiết: ${detail}`
        ));
        return;
      }
      resolve();
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
