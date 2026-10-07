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

Tauri `.exe` packaging still needs verification on Windows because this execution environment is Linux.

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
