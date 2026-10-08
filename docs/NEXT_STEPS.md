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

Phase 1.3 should continue with the real Platform Library:

- SQLite table and Tauri commands for platforms.
- Seeded platform records for social, blog 2.0, profile, forum, citation, portfolio, video, audio, and document-sharing entities.
- Platform Library screen with filters, scoring, automation mode, difficulty, and entity value.
- Preparation for Account Creation and Entity Care workflows.

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
