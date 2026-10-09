# Next Steps

## Current Status

Phase 1 desktop foundation has been started.

Important product target clarified: EntityManager must be a Windows PC desktop tool. The user should open the tool by clicking an `.exe` file.

## Immediate Next Recommended Step

Continue Phase 1: verify and harden the desktop application foundation.

Recommended next work:

- Verify Tauri dev shell opens on Windows.
- Verify Windows build notes are accurate on a Windows machine.
- Add local app settings storage design.
- Connect the React dashboard to real SQLite-backed records.
- Add seed data for platform library and demo project.

Phase 1.1 source work started:

- Added structured demo project seed data.
- Added starter Platform Library seed candidates.
- Added Settings/API config preview data.
- Updated dashboard to read seed data instead of only static placeholders.
- Added Tauri command skeleton for local settings config path.
- Added Prisma seed script for demo money site and starter platforms.

Phase 1.2 source work started:

- Added real Tauri commands for local SQLite access using `rusqlite`.
- Added `get_money_site` and `save_money_site` commands.
- Added `get_integration_settings` and `save_integration_setting` commands.
- Added a Money Sites screen with a form that saves through Tauri when running in desktop mode.
- Added a Settings screen with editable provider/API key records.
- Kept browser/Vite preview usable with seed-data fallback.
- Added Tauri v2 desktop capability config for the `main` window.
- Removed the empty Tauri bundle icon array to avoid packaging-time config failure.
- Added GitHub Actions workflow `Build Windows EXE` so the `.exe` can be built in GitHub and downloaded as an artifact.
- Added Tauri icon generation and bundle metadata for cleaner Windows packaging.
- Added automatic GitHub Release publishing for successful Windows installer builds.

Implemented foundation:

- Monorepo structure.
- Tauri desktop app as the main product shell.
- React dashboard UI inside the desktop app.
- Local SQLite schema for normal `.exe` usage.
- Prisma database package.
- Shared TypeScript domain types.
- Local workflow state skeleton.
- Environment/settings storage template for AI, CAPTCHA, email, proxy, and indexing API keys.
- Basic dashboard shell inspired by the user's preferred EntityAtlas/EntityCodex UI direction.

## Phase 1 Deliverables

- `package.json` workspace root. Done.
- `pnpm-workspace.yaml`. Done.
- `apps/desktop` Tauri app. Started.
- `packages/database` local SQLite schema setup. Started.
- `packages/shared` shared types. Started.
- `packages/workflow` local workflow engine skeleton. Started.
- `.env.example` or local settings template. Done.
- Development commands in README. Done.
- Windows `.exe` build notes. Done.

## Verification Completed In Current Workspace

- `pnpm typecheck` passes.
- `pnpm --filter @entitymanager/desktop build` passes.
- `pnpm db:generate` passes when HOME is set to a writable workspace path in this Linux sandbox.
- After Phase 1.1, `pnpm typecheck` still passes.
- After Phase 1.1, `pnpm --filter @entitymanager/desktop build` still passes.
- After Phase 1.2, `pnpm typecheck` still passes.
- After Phase 1.2, `pnpm --filter @entitymanager/desktop build` still passes.

Tauri `.exe` packaging still needs verification on Windows because this execution environment is Linux.

Rust/Tauri backend compile still needs verification on a machine with `cargo`; this sandbox does not have `cargo` installed.

If `apps/desktop/src-tauri/target/release/bundle/nsis/` is missing after `pnpm desktop:build`, the Tauri build failed before packaging. Capture the full Windows log with `pnpm desktop:build 2>&1 | Tee-Object build.log`.

For normal testing, prefer GitHub Releases. Each successful `Build Windows EXE` run publishes a release with the Windows installer attached.

`pnpm db:push` should be verified on Windows/local dev. In the current Linux sandbox, Prisma validation passes but `db:push` returns a blank schema-engine error under Node 24.

## Desktop Architecture Decision

Preferred V1 architecture:

- UI: React dashboard inside Tauri.
- Shell: Tauri for Windows `.exe`.
- Database: SQLite local file.
- Queue: local task table/state machine first.
- Browser automation: Playwright or extension bridge later, depending on packaging reliability.
- Chrome Extension: future support for semi-auto workflows on difficult sites.

PostgreSQL, Redis, and Docker should not be required for normal end users. They can be reserved for development, testing, or a future server edition.

## First Screens To Build

- Dashboard / Overview
- Money Sites
- Entity Profile
- Entity Builder
- Entity Care
- EEAT Planner
- Entity Graph
- Evidence Bank
- Platform Library
- API Integrations
- Reports
- Settings

## Next Implementation Phase

Phase 1.3 completed the real Platform Library:

- SQLite table and Tauri commands for platforms. Done.
- Seeded platform records for social, blog 2.0, profile, forum, citation, portfolio, video, audio, and document-sharing entities. Started.
- Platform Library screen with filters, scoring, automation mode, difficulty, and entity value. Done.
- Preparation for Account Creation and Entity Care workflows.

Next recommended build task:

- Validate Platform Library in the GitHub-built `.exe`.
- Add Entity Profile Builder backed by SQLite. Done.
- Add Account Creation workflow scaffolding using Platform Library records. Done.

Phase 1.4 validation and next build task:

- Validate Entity Profile save/load in the GitHub-built `.exe`.
- Validate Entity Builder account plan generation from Platform Library records.
- Add persistent Account records with statuses such as planned, created, needs manual review, failed, and verified. Done.
- Add workflow run history for account creation tasks.
- Add evidence URL capture and verification flow.

Phase 1.5 validation and next build task:

- Validate account record save/load in the GitHub-built `.exe`.
- Validate status changes for planned, created, needs manual review, failed, and verified.
- Add workflow run history tied to account records. Done.
- Add first automation queue model for CAPTCHA/email/manual gates. Done.

Phase 1.6 validation and next build task:

- Validate workflow history creation when saving account records and changing statuses.
- Validate automation queue items for CAPTCHA, email, manual review, and evidence gates.
- Add integration adapter interfaces for CAPTCHA and email providers. Started.
- Add encrypted/local-safe handling strategy for provider API keys before any real API calls. Started with masked placeholders.

Phase 1.7 validation and next build task:

- Validate Settings save/load with masked secret placeholders.
- Validate dry-run adapter checks for AI, CAPTCHA, email, proxy, and indexing providers.
- Replace placeholder masking with OS-backed encrypted secret storage. Done for newly saved keys.
- Implement first live AI provider adapter behind the dry-run interface. Done for Google Gemini live test.
- Validate encrypted key save/load in the packaged Windows `.exe`.
- Validate Gemini Live Test with a real API key and quota-enabled account.
- Implement first live CAPTCHA provider adapter behind the adapter interface.
- Implement first live email provider adapter behind the adapter interface.

Phase 1.8 validation and next build task:

- Confirm Windows Credential Manager stores AI/Gemini keys and SQLite only stores masked metadata.
- Confirm Settings reload shows `secure` key status after saving a key.
- Confirm Live Test succeeds for Gemini with a valid key, and returns useful failure messages for disabled providers, missing keys, quota errors, and unsupported providers.
- Add CAPTCHA provider adapter next, preferably 2Captcha or CapSolver, and route CAPTCHA queue items toward the configured provider. Done.

Phase 1.9 validation and next build task:

- Confirm CAPTCHA provider key is saved securely and Settings reload shows `secure`.
- Confirm CAPTCHA Live Test checks provider access through 2Captcha or CapSolver balance endpoint.
- Confirm CAPTCHA queue payloads can be edited as JSON with `captchaType`, `websiteUrl`, and `websiteKey`.
- Confirm Send CAPTCHA keeps incomplete queue items in `waiting` status with a useful message.
- Confirm Send CAPTCHA submits valid reCAPTCHA v2 queue items to the configured provider and stores the provider task id in queue payload.
- Add CAPTCHA result polling with provider `getTaskResult`. Done.
- Add solved token capture into queue payload for later browser/extension injection. Done.

Phase 1.10 validation and next build task:

- Confirm CAPTCHA queue payload retains `providerTaskId` after Send CAPTCHA.
- Confirm Poll Result calls 2Captcha/CapSolver `getTaskResult`.
- Confirm pending provider responses keep the queue item in `waiting`.
- Confirm ready provider responses save `solutionToken` and mark the queue item as `resolved`.
- Confirm queue payload includes `automationHook.target = browser_or_extension` and `action = inject_recaptcha_token`.
- Build the browser automation/extension bridge that can read a resolved CAPTCHA queue item and inject `solutionToken` into `g-recaptcha-response`. Done.

Phase 1.11 validation and next build task:

- Confirm Bridge Payload is blocked until CAPTCHA queue status is `resolved` and `solutionToken` exists.
- Confirm Bridge Payload returns `queueId`, `accountId`, `platformName`, `websiteUrl`, `websiteKey`, `solutionToken`, `tokenField`, action, and next step.
- Confirm Mark Injected updates queue payload with injection metadata and creates a workflow history row.
- Confirm Mark Failed keeps the workflow honest with a failed injection event and review-ready account notes.
- Build the real Chrome Extension/browser automation side that reads the bridge contract and injects the token into the page DOM. Done as a manual Bridge Payload MVP.

Phase 1.12 validation and next build task:

- Run `pnpm extension:build` or `pnpm --filter @entitymanager/extension build`.
- Load `apps/extension/dist` in Chrome as an unpacked extension.
- In Desktop, resolve a CAPTCHA queue item, click Bridge Payload, and copy the JSON payload.
- Paste the payload into the extension popup and keep callback URL as `http://127.0.0.1:17321/captcha/injection/complete`.
- Open the target signup page or a test page with `g-recaptcha-response`, then click Inject Active Tab.
- Confirm the extension injects the token, reports back to Desktop, updates queue payload injection metadata, and creates a workflow history row.
- Add the submit/verify account step after a successful token injection. Done.
- Replace manual JSON paste with automatic payload fetching from Desktop or a native messaging channel. Done with a local HTTP MVP.

Phase 1.13 validation and next build task:

- Confirm Desktop starts the local bridge server at `http://127.0.0.1:17321`.
- Confirm `GET /captcha/injection/next` returns the oldest resolved CAPTCHA queue item with a `solutionToken` and no completed injection marker.
- Confirm the extension Fetch Next Payload action fills the popup JSON automatically.
- Confirm Inject Active Tab posts back to `POST /captcha/injection/complete`.
- Confirm successful injection creates a `submit_verify` queue item.
- Confirm Mark Verified resolves `submit_verify`, marks the account `verified`, and writes workflow history.
- Confirm Mark Submit Failed marks the queue failed and moves the account to manual review.
- Build platform-specific submit/verify browser automation with evidence URL capture. Done as an extension MVP.

Phase 1.14 validation and next build task:

- Confirm CAPTCHA injection success creates a `submit_verify` queue payload with selector lists.
- Confirm `GET /account/submit-verify/next` returns a ready submit/verify payload.
- Confirm the extension `Submit/Verify Tab` action clicks a visible submit/verify control when one matches platform or generic selectors.
- Confirm `POST /account/submit-verify/complete` resolves the queue, saves current URL as evidence, marks account verified, and writes workflow history.
- Confirm failed selector matching reports a failed submit/verify callback and moves the account to manual review.
- Add platform-specific field-fill recipes for account forms before clicking submit. Done.
- Add pre-submit safety checks so the extension can explain missing fields, CAPTCHA not injected, or unsupported platform state. Done.

Phase 1.15 validation and next build task:

- Confirm submit/verify payload includes username, email, display name, bio, website URL, field selectors, required fields, and CAPTCHA safety flag.
- Confirm Desktop derives payload values from Account, Entity Profile, and Money Site records.
- Confirm extension fills matching fields before attempting submit.
- Confirm extension blocks submit and reports missing `value`, `selector`, `field`, or `captchaToken` checks.
- Confirm successful submit/verify callback saves evidence URL, resolves queue, and marks the account verified.
- Add a Desktop editor for per-platform selector/value override recipes.
- Add browser-side dry-run mode so users can preview what would be filled/clicked before real submit.

## First Data Models To Design

- User, optional for later auth/license
- Project
- MoneySite
- BrandProfile
- NapProfile
- AuthorProfile
- Service
- Product
- MediaAsset
- SeoTarget
- Platform
- Account
- WorkflowRun
- WorkflowTask
- Evidence
- ContentUrl
- CarePlan
- EeatRecommendation
- IntegrationSetting

## Important Reminder

At the end of every coding session, update this file and `docs/WORK_LOG.md`.
