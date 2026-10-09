import type { InjectionReport, SubmitVerifyReport } from "./types";

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
  const typedMessage = message as { type?: string; report?: InjectionReport | SubmitVerifyReport; callbackUrl?: string };

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
