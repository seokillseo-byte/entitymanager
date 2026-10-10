# Work Log

## 2026-10-08

- Confirmed repository: `seokillseo-byte/entitymanager`.
- Repository was empty at initialization time.
- Added project README.
- Added professional vibe coding plan.
- Added master prompt for switching ChatGPT/Codex sessions or accounts.
- Added next steps tracker.
- Clarified critical product requirement: EntityManager must be a Windows PC desktop tool opened by clicking an `.exe` file.
- Updated planning direction from local SaaS-style app to desktop-first app.
- Started Phase 1 Desktop Foundation.
- Added monorepo workspace files: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`.
- Added `apps/desktop` Tauri + React shell with an initial dashboard UI.
- Added `packages/shared` with core entity/dashboard types and readiness scoring helper.
- Added `packages/workflow` with workflow statuses, task creation, and transition helper.
- Added `packages/database` with a Prisma SQLite schema covering projects, money sites, profiles, platforms, accounts, workflows, evidence, content URLs, care plans, EEAT recommendations, and integration settings.
- Added `docs/BUILD_EXE.md` with Windows `.exe` build notes.
- Verified `pnpm typecheck` passes locally.
- Verified desktop frontend build with `pnpm --filter @entitymanager/desktop build` locally.
- Verified Prisma client generation with `pnpm db:generate` after setting a writable HOME in the Linux sandbox.
- Started Phase 1.1.
- Added structured demo seed data in `packages/shared/src/seed.ts`.
- Updated the dashboard to show demo Money Site data, Platform Library candidates, and local Settings/API config preview.
- Added a Tauri command skeleton for resolving the local settings config file path.
- Added Prisma database seed script for demo project, money site, and starter platforms.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.1 changes.
- Noted that `pnpm db:push` needs Windows/local verification: Prisma schema validation passes, but the Linux sandbox returns a blank schema-engine error under Node 24.
- Started Phase 1.2.
- Added real Tauri commands for local SQLite reads/writes using `rusqlite`.
- Added Money Sites form wired to `get_money_site` and `save_money_site`.
- Added Settings form wired to `get_integration_settings` and `save_integration_setting`.
- Kept Vite/browser preview safe by falling back to seed data when Tauri commands are unavailable.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.2 changes.
- Could not run `cargo check` in this Linux sandbox because `cargo` is not installed; Rust/Tauri backend needs verification on Windows or a Rust-enabled runner.
- Added a Tauri v2 capability file and explicit `main` window label for Windows desktop packaging.
- Removed the empty bundle icon array from `tauri.conf.json` so packaging can proceed without an invalid icon configuration.
- Updated `.exe` build notes with the expected NSIS output folder and a PowerShell log capture command.
- Added a GitHub Actions workflow to build the Windows `.exe` installer on `windows-latest` and upload it as an artifact.
- Added a reusable PowerShell icon generator for Tauri Windows packaging.
- Configured Tauri bundle icon and publisher metadata.
- Updated the Windows build workflow to publish successful installer builds as GitHub Releases.
- Started Phase 1.3 Platform Library.
- Added shared Platform Library record types and expanded seeded platform data across social, blog, profile, citation, portfolio, video, audio, document, QA, local, and media entities.
- Added local SQLite `platforms` table with seed records.
- Added Tauri commands `get_platforms` and `save_platform`.
- Added a real Platform Library screen with type, automation, and difficulty filters plus platform authority/entity metadata.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Platform Library changes.
- Started Phase 1.4 Entity Profile Builder and Account Creation workflow scaffolding.
- Added shared Entity Profile and Account Creation Plan types.
- Added seeded demo entity profile data for SEO/EEAT identity fields.
- Added local SQLite `entity_profiles` table with `get_entity_profile` and `save_entity_profile` Tauri commands.
- Added an Entity Profile screen with brand, legal, NAP, sameAs, keyword, expertise, and trust signal fields.
- Added an Entity Builder screen that generates account creation plans from Platform Library records.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.4 changes.
- Started Phase 1.5 Persistent Account Records and Workflow Status.
- Added shared Account Record and Account Status types.
- Added local SQLite `accounts` table with planned, created, needs manual review, failed, and verified statuses.
- Added Tauri commands `get_accounts` and `save_account`.
- Updated Entity Builder so generated platform plans can be saved as persistent account records.
- Added account status, evidence URL, and notes editing in the Entity Builder screen.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.5 changes.
- Started Phase 1.6 Workflow Run History and Automation Queue Foundation.
- Added shared Workflow Run and Automation Queue item types.
- Added local SQLite `workflow_runs` and `automation_queue` tables.
- Added Tauri commands for reading/saving workflow runs and queue items.
- Updated Entity Builder to write workflow run history when account records are saved or statuses change.
- Added queue generation for CAPTCHA, email, manual review, and evidence gates.
- Added Automation Queue and Workflow History panels to the Entity Builder screen.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.6 changes.
- Started Phase 1.7 Integration Adapter Foundation and Secure API Key Handling.
- Added `@entitymanager/integrations` package with dry-run adapter helpers and normalized provider capabilities.
- Added shared provider config, key status, capability, and adapter result types.
- Updated Settings to use secure key placeholders instead of displaying stored secrets.
- Updated local SQLite integration settings with key status and last test metadata.
- Added Tauri dry-run command for integration adapter checks.
- Added Settings dry-run test UI for AI, CAPTCHA, email, proxy, and indexing providers.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.7 changes.
- Started Phase 1.8 Encrypted Secret Storage and First Live Provider Adapter.
- Added Rust `keyring` integration so newly saved provider API keys are stored in the OS credential store instead of SQLite.
- Kept SQLite integration settings as metadata only: provider, enabled flag, masked key display, key status, and last test timestamp.
- Added secure key detection so Settings can show `secure` when the key exists in the OS credential store.
- Added a live adapter Tauri command for the first real provider path.
- Implemented the first live AI adapter test for Google Gemini using the encrypted key from the OS credential store.
- Updated Settings with a Live Test action alongside Dry-run Test.
- Kept non-AI providers behind the adapter interface with honest “queued for next adapter pass” live-test messaging.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.8 frontend/shared changes.
- Could not run local `cargo check` because this Linux sandbox does not have `cargo`; Windows Rust/Tauri compile should be validated by GitHub Actions.
- Started Phase 1.9 CAPTCHA Provider Adapter and Queue Execution Hook.
- Added a Tauri command to execute CAPTCHA automation queue items.
- Added 2Captcha and CapSolver task submission support for `RecaptchaV2TaskProxyless` / `ReCaptchaV2TaskProxyLess`.
- Added CAPTCHA live checks through lightweight provider balance endpoints before queue execution.
- Updated CAPTCHA queue payloads to use JSON with `captchaType`, `websiteUrl`, and `websiteKey`.
- Added a Settings live test path for CAPTCHA providers.
- Added an Entity Builder queue action to send CAPTCHA queue items to the configured provider.
- Kept incomplete CAPTCHA payloads in `waiting` status with a clear message instead of sending invalid provider requests.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.9 frontend/shared changes.
- Started Phase 1.10 CAPTCHA Result Polling and Token Capture.
- Added provider result polling for 2Captcha and CapSolver through `getTaskResult`.
- Added a Tauri command to poll CAPTCHA queue items using the stored provider task id.
- Captured solved CAPTCHA tokens into queue payload as `solutionToken`.
- Added an `automationHook` payload block for future browser automation or extension token injection.
- Updated CAPTCHA queue UI with a Poll Result action.
- Queue items now move to `resolved` when a provider returns a ready solution token, or remain `waiting` when still processing.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.10 changes.
- Started Phase 1.11 Browser/Extension CAPTCHA Injection Bridge.
- Added shared CAPTCHA bridge request, payload, and result types for desktop/browser-extension handoff.
- Added a Tauri command that exposes a resolved CAPTCHA queue item as an injection payload with `solutionToken`, target token field, action, and next workflow step.
- Added a Tauri command for browser/extension automation to report CAPTCHA injection success or failure.
- Injection completion now updates the queue payload with injection metadata and writes a workflow run event for submit/verify readiness.
- Updated the Entity Builder queue UI with a Bridge Payload preview plus Mark Injected / Mark Failed actions for desktop-side validation before a real extension is attached.
- Re-verified `pnpm typecheck` and `pnpm --filter @entitymanager/desktop build` after Phase 1.11 changes.
- Started Phase 1.12 Chrome Extension Bridge MVP.
- Added `apps/extension`, a minimal Manifest V3 Chrome extension package.
- Added a popup workflow that accepts the Desktop Bridge Payload JSON and local callback URL.
- Added a content script that injects solved CAPTCHA tokens into `g-recaptcha-response` or the configured token field, then dispatches `input` and `change` events.
- Added a background service worker that reports injection success or failure back to Desktop through the local bridge callback.
- Added a Desktop local bridge server at `http://127.0.0.1:17321` with `POST /captcha/injection/complete`.
- Desktop now starts the local extension bridge on app load and reuses the existing CAPTCHA injection completion workflow.
- Added a read-only Bridge Payload JSON box in the Desktop UI so the MVP extension can be tested without native messaging yet.
- Added `extension:build` and extension package build scripts.
- Re-verified direct TypeScript checks for the extension, desktop, and shared package plus the direct extension static build after Phase 1.12 changes.
- Started Phase 1.13 Account Submit/Verify Step and Extension Auto Payload Fetch.
- Added a Desktop bridge endpoint `GET /captcha/injection/next` so the Chrome extension can fetch the next resolved CAPTCHA payload without manual JSON copy/paste.
- Updated the extension popup with a Fetch Next Payload action and persisted fetch/callback URLs.
- CAPTCHA injection success now creates a dedicated `submit_verify` automation queue item.
- Added shared submit/verify request/result types and a Desktop command to complete the submit/verify queue step.
- Added Desktop queue actions for Mark Verified and Mark Submit Failed on `submit_verify` items.
- Updated the extension README with the new auto-fetch workflow.
- Started Phase 1.14 Platform-Specific Submit Automation and Evidence Capture.
- Added shared submit/verify payload types with platform id, selector lists, evidence capture mode, and notes.
- Added Desktop local bridge endpoints `GET /account/submit-verify/next` and `POST /account/submit-verify/complete`.
- Added platform-aware submit/verify selector templates for GitHub, Medium, Tumblr, Pinterest, and generic fallback flows.
- Submit/verify queue payloads now include submit selectors, verify selectors, evidence capture mode, source CAPTCHA queue id, and injection evidence.
- Updated the Chrome extension content script so it can click visible submit/verify elements and capture the current URL as evidence.
- Updated the extension popup with a Submit/Verify Tab action and submit/verify bridge URLs.
- Updated the extension background callback handling to report both CAPTCHA injection and submit/verify completion back to Desktop.
- Started Phase 1.15 Platform Form Fill Recipes and Pre-submit Safety Checks.
- Added submit/verify form values to the bridge payload: username, email, display name, bio, and website URL.
- Desktop now builds submit/verify payloads from SQLite account records, entity profile, and money site data.
- Added field selector recipes for username, email, display name, bio, and website URL with generic selectors plus GitHub, Medium, Tumblr, and Pinterest hints.
- Added required field and CAPTCHA-token safety metadata to submit/verify payloads.
- Updated the extension to fill available form fields before submit/verify.
- Extension now blocks submit when required values, matching fields, or CAPTCHA token are missing and reports the exact missing checks back to Desktop.
- Extension submit/verify callback now includes filled fields, missing checks, clicked selector, and evidence URL.
- Started Phase 1.16 Selector Recipe Editor and Dry-run Preview.
- Added shared `SelectorRecipeRecord` type and a new Desktop `Selector Recipes` module.
- Added local SQLite `selector_recipes` table with default recipes seeded from Platform Library records.
- Added Tauri commands `get_selector_recipes` and `save_selector_recipe`.
- Submit/verify payload generation now prioritizes saved selector recipes over generated defaults.
- Desktop recipe editor can update field selector JSON, submit selectors, verify selectors, required fields, and CAPTCHA requirement per platform.
- Added extension Dry-run Preview action that fetches the next submit/verify payload and reports planned fields, planned click selector, and missing safety checks without filling or clicking.

## Current Decision

The project should be built as a professional Windows desktop Entity Builder + Entity Care + EEAT Growth Platform, not merely an account creation tool.

Preferred V1 stack: Tauri desktop shell, React dashboard UI, local SQLite database, local workflow state machine, configurable AI/CAPTCHA/email/proxy integrations, and future Chrome Extension support.

Normal users should not need Docker, PostgreSQL, Redis, or terminal commands to use the packaged `.exe`.

## Next Recommended Action

Validate Phase 1.16 in the packaged `.exe`: edit a platform recipe in Desktop, fetch submit/verify payload from the extension, run Dry-run Preview to confirm planned fills/clicks and missing checks, then run Submit/Verify Tab only after preview is clean. Next, add recipe import/export and per-platform form-fill dry-run history.


## 2026-10-09 — Phase 1.17 Recipe Import/Export + Dry-run History

- Added shared DryRunHistoryRecord model and SQLite dry_run_history table.
- Added Tauri commands to read and save dry-run history, plus local extension bridge callback.
- Extension Dry-run Preview reports planned fields, selector, missing checks, account/platform, URL and timestamp to Desktop.
- Selector Recipes screen supports JSON export/import and recent dry-run history.
- Verify Windows Rust/Tauri compilation and packaged installer via GitHub Actions before distributing.

## 2026-10-09 — Phase 1.18 Selector Failure Analytics & Recipe Suggestions

- Added per-platform dry-run analytics with failure counts and repeated missing-check detection.
- Added recipe suggestion drafts based on recurring field-selector and submit-button failures.
- Suggestions update the editable recipe form only; they are not written to SQLite until the user reviews the proposed selectors and clicks Save Recipe.
- Windows TypeScript/Rust build and installer still require GitHub Actions verification before release distribution.



## 2026-10-09 — Phase 1.19 Selector Health Trends & Success Rate Dashboard

- Added a per-platform dry-run success-rate dashboard with overall success/failure counts and a rolling 30-day success rate.
- Added recipe before/after comparison based on dry-run timestamps relative to the recipe's saved `updatedAt`.
- A recipe is only labelled as having a confirmed improvement when at least one successful dry-run exists after the recipe update; saving alone never marks it improved.
- Trend outcomes are derived from the existing dry-run history: a run is successful only when required checks are clear, at least one field is planned, and a submit selector is found.
- TypeScript/build and Windows Tauri packaging still need verification through CI before release.


## 2026-10-09 — Phase 1.20 Selector Health Tests & Release Verification

- Extracted selector health aggregation into a pure module so success-rate and before/after rules can be unit tested independently of the React view.
- Added automated Node.js tests for empty history, overall success rates, the rolling 30-day window, recipe saves without a later dry-run, failed post-update dry-runs, successful post-update confirmation, and Unix timestamp formats.
- Added `pnpm test:selector-health` and wired it into the Windows GitHub Actions workflow before typecheck/build.
- Corrected timestamp parsing to support ISO dates and numeric Unix timestamps in seconds or milliseconds; future-dated runs are excluded from the 30-day window.
- GitHub Actions typecheck, Windows packaging, and release status must still be checked before considering this phase complete. Do not publish a manual release if CI is red or pending.


## 2026-10-09 — Phase 1.21 Packaged App Validation & Legacy Data Tests

- Added a defensive normalizer for legacy/malformed dry-run history records. Missing arrays and strings receive safe defaults; missing or invalid timestamps are not fabricated, so time-window and recipe before/after calculations exclude them.
- Selector-health aggregation evaluates normalized records, and Desktop normalizes SQLite-loaded and refreshed dry-run history before rendering analytics.
- Added regression tests for historical records with missing fields, malformed values, and invalid/absent/non-finite timestamps.
- Packaged Windows `.exe` validation with a real extension callback and direct SQLite/dashboard reconciliation still requires a human-run test against the downloaded installer; this environment cannot execute the Windows app or inspect its local SQLite database.
- Do not publish a new release until GitHub Actions Windows build is green and packaged-app validation is recorded.


## Phase 1.22 — Dashboard Chrome Extension Download

- Added an always-visible Chrome Extension download panel to the Overview dashboard, pointing to the latest GitHub Release asset.
- Updated the Windows GitHub Actions workflow to build `apps/extension`, package `apps/extension/dist` as `EntityManager-Chrome-Extension.zip`, upload it as an Actions artifact, and attach it to each successful desktop release.
- Added plain-language installation steps directly beside the dashboard download link.
- Validation is pending the next Windows Actions run; the latest-release download link will only work after a release containing the ZIP is published.


## 2026-10-10 — Overview Latest Downloads

- Updated Overview to show only two current download options: latest Chrome Extension ZIP and latest Windows installer EXE.
- Added latest GitHub Release metadata display (release name, tag, publish date, installer filename) so the visible version follows the latest published release instead of listing old builds.
- Added a Tauri download command with an allowlist for the Extension ZIP and EntityManager Windows setup executables.
- Validation pending: run TypeScript checks and Windows installer workflow; verify both Overview buttons download the assets from the latest published release.


## 2026-10-10 — Overview Visual Layout Polish

- Rebalanced Overview into a responsive two-column dashboard and removed the row-spanning layout that created large blank areas beside cards.
- Reduced the project-readiness chart size and tightened panel spacing, metadata wrapping, and platform preview rows for easier scanning.
- Added responsive breakpoints so Overview can collapse to one column on narrower windows and use a compact sidebar/navigation layout on small screens.
- Kept the two latest-release download cards and their download behavior intact.
- Validation pending for the newest commits: GitHub Actions TypeScript, tests, and Windows installer build must pass before merge/release.


## 2026-10-10 — Phase 1.23 Read-only Dry-run Diagnostics Export

- Added an Export diagnostics JSON action to Selector Recipes; it summarizes the local dry-run history currently loaded by Desktop without modifying SQLite.
- The report includes overall totals, success/failure rate, rolling 30-day totals, per-platform counts, original records for reconciliation, and invalid/missing timestamp count. Dates are never invented.
- Added an explicit UI warning that exports can include locally stored account IDs and page URLs.
- Added deterministic tests for aggregate counts, platform summaries, recent-window handling, malformed timestamps, and empty history.
- Added the diagnostics test command to the Windows release workflow so the new logic is checked before packaging and publishing.
- Validation pending: run diagnostics and selector-health tests, typecheck, Windows installer workflow, and verify both release assets are present.


## 2026-10-10 — Phase 1.24 Diagnostic Report Integrity Validation

- Added a read-only verifier for exported diagnostic JSON in Selector Recipes.
- It checks schema/version, export timestamp, required fields, overall and 30-day totals, success rate, invalid timestamp count, and per-platform totals against the report's included records.
- Added explicit wording that an internally consistent report does not prove the export contains every row from local SQLite; verification never imports records or writes to the database.
- Added deterministic tests for valid reports, tampered overall/platform totals, malformed schema, empty history, and invalid record timestamps; wired the test command into Windows CI.
- Validation pending: wait for all Windows PR checks, inspect failures if any, then verify the official release contains both EXE and Extension ZIP.


## 2026-10-10 — Phase 1.25 SQLite-to-Diagnostics Reconciliation

- Added a read-only Tauri command that independently queries total dry-run history rows, distinct IDs, and oldest/newest timestamps from SQLite.
- Selector Recipes now shows how many records are loaded versus how many exist in SQLite and refreshes both values together.
- Diagnostic exports now include source audit metadata and explicitly flag reports that contain only the newest 100 loaded records.
- The validator checks source count bounds, included-record count, timestamp metadata, and whether the completeness flag agrees with source and included counts.
- Added tests for complete versus partial exports and tampered source counts.
- Validation pending: run diagnostic tests, full TypeScript checks, and the Windows release workflow; verify both EXE and Extension ZIP assets before distributing.


## 2026-10-10 — Phase 1.26 Complete Dry-run History Reconciliation

- Kept the fast recent-history command for normal initial screen loading and added a separate read-only command to retrieve every dry-run row from local SQLite.
- Added a “Load all history” action; it only replaces the visible list after row count, distinct IDs, and oldest/newest timestamp bounds match the SQLite audit.
- Diagnostic export now re-reads the full SQLite history rather than exporting only the newest 100 loaded rows. Export is blocked if the complete row set cannot be reconciled against SQLite counts, distinct IDs, and timestamp bounds.
- Strengthened report validation to compare included distinct IDs and complete-report timestamp bounds with source audit metadata.
- Added regression coverage for 1,500 records, duplicate IDs, altered timestamp bounds, and missing audit extrema. Existing incomplete-report validation remains in place.
- Safety invariant: these operations are read-only and do not modify or delete historical records.
- Validation pending: run all Node diagnostic/selector-health tests, TypeScript checks, Chrome extension build, and Windows installer workflow. Do not merge or publish until required checks are green and both release assets are verified.


## 2026-10-10 — Selector Recipes export reliability and layout

- Replaced the WebView anchor/object-URL download path for recipe and complete dry-run JSON exports with a native Tauri file-write command targeting the user's Downloads folder; export filenames are timestamped to avoid overwriting prior reports.
- Added filename validation and explicit success/failure feedback so export failures show the actual reason rather than failing silently.
- Reorganized Selector Recipes into a clearer hierarchy with compact import/export tools, separated diagnostic sections, and better-spaced recipe editor cards with responsive behavior.
- Validation pending: TypeScript checks, diagnostic/selector tests, extension build, and Windows installer workflow. Do not merge until required checks pass.


## 2026-10-11 — Vietnamese Entity Builder onboarding

- Rewrote the Entity Builder's first-use instructions and primary labels in Vietnamese to match the user's preferred language.
- Added an explicit four-step guide explaining the Entity Profile prerequisite, the meaning of saving an account record, and how to find saved records.
- Added a dedicated “Tài khoản đã lưu” section with a clear empty state and a compact list of saved records, evidence URLs, and Vietnamese status labels.
- Clarified that saving a record only stores local tracking data in SQLite; it does not register an account on a third-party website.
- Improved spacing, contrast, and responsive behavior for the guide and saved-account list.
- Validation pending: TypeScript checks, relevant tests, extension build, and Windows installer workflow. Do not merge until required checks pass.
