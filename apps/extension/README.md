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
9. Click `Submit/Verify Tab` in the extension to fetch `http://127.0.0.1:17321/account/submit-verify/next`, click a matching submit/verify selector on the active tab, and report the current URL back to Desktop as evidence.

Manual JSON paste is still supported as a fallback for debugging.

Use `Chạy thử Selector Recipe` trước khi thực hiện bất kỳ thao tác nào. Chức năng này lấy cấu hình chạy thử riêng từ Desktop, không phụ thuộc hàng đợi CAPTCHA/Submit-Verify. Nó chỉ đọc các trường trên tab đang mở, không điền dữ liệu và không nhấn nút gửi. Kết quả được ghi vào SQLite qua endpoint lịch sử chạy thử.

Phase 1.18 hardens platform execution into three safe operator steps:

1. `Chạy thử Selector Recipe`: preview selectors and button checks only.
2. `Điền thử an toàn`: fill text/profile fields and save supported profile forms such as GitHub.
3. `Cập nhật avatar/banner`: upload media separately so image modals do not reset unsaved text fields.

Desktop payloads may include `executionSteps`, `saveTextSelector`, and `mediaConfirmSelector` so each platform can document the intended flow without scattering platform-specific behavior through the extension.

Phase 1.20 adds validation auto-sync. After `Chạy thử Selector Recipe`, `Điền thử an toàn`, or `Cập nhật avatar/banner`, the extension posts a compact status event to `http://127.0.0.1:17321/platform-validation/sync`. Desktop stores it in the Platform Validation checklist so operators do not have to update `dry-run ok`, `text saved`, `media uploaded`, or `needs recipe fix` by hand.

## Form fill and safety checks

Before clicking submit/verify, the extension attempts to fill:

- username
- email
- display name
- bio
- website URL
- company, location, social links
- avatar/profile image and banner image when the platform has a safe upload path

The payload comes from Desktop SQLite data: account record, entity profile, and money site. The extension blocks submit when a required value is empty, a required selector cannot be found, a required field remains empty after fill, or the CAPTCHA token field is missing.

## Build

```bash
pnpm extension:build
```

The loadable extension lives in:

```text
apps/extension/dist
```

## Notes

This MVP intentionally keeps the browser side small. Submit/verify selectors and field selectors are platform-aware where known and fall back to common visible controls. Desktop Selector Recipes can override selectors per platform. The next pass should add recipe import/export and dry-run history.
