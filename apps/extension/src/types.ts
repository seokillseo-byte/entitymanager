export interface CaptchaInjectionPayload {
  queueId: string;
  accountId: string;
  platformName: string;
  websiteUrl: string;
  websiteKey: string;
  solutionToken: string;
  tokenField: string;
  action: "inject_recaptcha_token";
  nextStep: "submit_or_verify_account";
}

export interface AccountSubmitVerifyPayload {
  queueId: string;
  accountId: string;
  platformId: string;
  platformName: string;
  action: "submit_or_verify_account";
  formValues: {
    username: string;
    email: string;
    displayName: string;
    bio: string;
    websiteUrl: string;
    company: string;
    location: string;
    socialLinks: string;
    profileImage: string;
    avatarImageUrl: string;
    bannerImageUrl: string;
  };
  fieldSelectors: {
    username: string[];
    email: string[];
    displayName: string[];
    bio: string[];
    websiteUrl: string[];
    company: string[];
    location: string[];
    socialLinks: string[];
    profileImage: string[];
    avatarImageUrl: string[];
    bannerImageUrl: string[];
  };
  requiredFields: Array<keyof AccountSubmitVerifyPayload["formValues"]>;
  requiresCaptchaToken: boolean;
  submitSelectors: string[];
  verifySelectors: string[];
  evidenceCapture: "current_url";
  notes: string;
  executionSteps?: Array<"dry_run" | "fill_text" | "upload_media" | "submit_verify">;
  saveTextSelector?: string;
  mediaConfirmSelector?: string;
}

export interface BridgeStorage {
  captchaPayload?: CaptchaInjectionPayload;
  submitVerifyPayload?: AccountSubmitVerifyPayload;
  fetchUrl?: string;
  callbackUrl?: string;
  submitFetchUrl?: string;
  submitCallbackUrl?: string;
}

export type PlatformValidationStatus = "not_tested" | "dry_run_ok" | "text_saved" | "media_uploaded" | "needs_recipe_fix";

export interface PlatformValidationSyncReport {
  platformId: string;
  platformName: string;
  status: PlatformValidationStatus;
  step: "dry_run" | "fill_text" | "upload_media" | "submit_verify";
  currentUrl: string;
  message: string;
  missingChecks: string[];
  createdAt: string;
}

export interface InjectCaptchaMessage {
  type: "ENTITYMANAGER_INJECT_CAPTCHA";
  payload: CaptchaInjectionPayload;
}

export interface SubmitVerifyMessage {
  type: "ENTITYMANAGER_SUBMIT_VERIFY";
  payload: AccountSubmitVerifyPayload;
  dryRun?: boolean;
  fillOnly?: boolean;
}

export interface InjectionReport {
  queueId: string;
  accountId: string;
  injector: "browser_extension";
  success: boolean;
  evidenceUrl: string;
  message: string;
}

export interface InjectionResponse {
  success: boolean;
  message: string;
  evidenceUrl: string;
}

export interface SubmitVerifyReport {
  queueId: string;
  accountId: string;
  success: boolean;
  evidenceUrl: string;
  message: string;
}

export interface SubmitVerifyResponse {
  success: boolean;
  message: string;
  evidenceUrl: string;
  clickedSelector: string;
  filledFields: string[];
  missingFields: string[];
  plannedFields: string[];
  plannedSelector: string;
}

export interface DryRunHistoryReport {
  id: string;
  platformId: string;
  platformName: string;
  accountId: string;
  plannedFields: string[];
  plannedSelector: string;
  missingChecks: string[];
  currentUrl: string;
  createdAt: string;
}
