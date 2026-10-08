import type { InjectionReport } from "./types";

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
  const typedMessage = message as { type?: string; report?: InjectionReport; callbackUrl?: string };

  if (typedMessage.type !== "ENTITYMANAGER_REPORT_INJECTION" || !typedMessage.report) {
    return false;
  }

  void reportInjection(typedMessage.report, typedMessage.callbackUrl)
    .then((messageText) => sendResponse({ success: true, message: messageText }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Desktop callback failed";
      sendResponse({ success: false, message });
    });

  return true;
});

async function reportInjection(report: InjectionReport, callbackUrl?: string): Promise<string> {
  if (!callbackUrl?.trim()) {
    return "Injection completed locally. No desktop callback URL configured.";
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

  return "Injection callback sent to desktop bridge.";
}
