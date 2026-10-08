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

export interface BridgeStorage {
  captchaPayload?: CaptchaInjectionPayload;
  callbackUrl?: string;
}

export interface InjectCaptchaMessage {
  type: "ENTITYMANAGER_INJECT_CAPTCHA";
  payload: CaptchaInjectionPayload;
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
