# Next Steps

## Current Status

Repository initialized with planning documents only. No application code has been added yet.

Important product target clarified: EntityManager must be a Windows PC desktop tool. The user should open the tool by clicking an `.exe` file.

## Immediate Next Recommended Step

Phase 1: create the desktop application foundation.

Recommended implementation:

- Monorepo structure.
- Tauri desktop app as the main product shell.
- React/Next-style dashboard UI inside the desktop app.
- Local SQLite database for normal `.exe` usage.
- Prisma or another typed database layer if it packages cleanly.
- Local background task engine for workflows and queues.
- Environment/settings storage for AI, CAPTCHA, email, proxy, and indexing API keys.
- Basic dashboard shell inspired by the user's preferred EntityAtlas/EntityCodex UI direction.

## Phase 1 Deliverables

- `package.json` workspace root.
- `pnpm-workspace.yaml`.
- `apps/desktop` Tauri app.
- `packages/database` local SQLite schema setup.
- `packages/shared` shared types.
- `packages/workflow` local workflow engine skeleton.
- `.env.example` or local settings template.
- Development commands in README.
- Windows `.exe` build notes.

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