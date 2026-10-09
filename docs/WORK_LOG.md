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
