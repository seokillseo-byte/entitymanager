# EntityManager Chrome Extension Bridge MVP

This is the Phase 1.12 MVP bridge between the EntityManager desktop app and browser pages.

## Current flow

1. In EntityManager Desktop, solve/poll a CAPTCHA queue item until it is `resolved`.
2. Click `Bridge Payload` and copy the JSON payload.
3. Load `apps/extension/dist` as an unpacked Chrome extension.
4. Paste the JSON payload into the extension popup.
5. Open the target signup page and click `Inject Active Tab`.
6. The content script injects `solutionToken` into `g-recaptcha-response`.
7. The extension POSTs the injection result to `http://127.0.0.1:17321/captcha/injection/complete`.

## Build

```bash
pnpm extension:build
```

The loadable extension lives in:

```text
apps/extension/dist
```

## Notes

This MVP intentionally keeps the browser side small. The next pass should replace manual JSON paste with an automatic queue fetch channel and add submit/verify account execution after a successful injection.
