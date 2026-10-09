# EntityManager Chrome Extension Bridge MVP

This is the Phase 1.13 MVP bridge between the EntityManager desktop app and browser pages.

## Current flow

1. In EntityManager Desktop, solve/poll a CAPTCHA queue item until it is `resolved`.
2. Keep EntityManager Desktop open so its local bridge server is available at `http://127.0.0.1:17321`.
3. Load `apps/extension/dist` as an unpacked Chrome extension.
4. Click `Fetch Next Payload` in the extension popup.
5. Open the target signup page and click `Inject Active Tab`.
6. The content script injects `solutionToken` into `g-recaptcha-response`.
7. The extension POSTs the injection result to `http://127.0.0.1:17321/captcha/injection/complete`.
8. Desktop creates a `submit_verify` queue item so the account can move into the submit/verify step.

Manual JSON paste is still supported as a fallback for debugging.

## Build

```bash
pnpm extension:build
```

The loadable extension lives in:

```text
apps/extension/dist
```

## Notes

This MVP intentionally keeps the browser side small. The next pass should let browser automation perform the real submit/verify click and capture an evidence URL automatically.
