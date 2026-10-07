# Next Steps

## Current Status

Repository initialized with planning documents only. No application code has been added yet.

## Immediate Next Recommended Step

Phase 1: create the application foundation.

Recommended implementation:

- Monorepo structure.
- Next.js web app.
- Node.js API app.
- Shared TypeScript packages.
- Prisma database package.
- PostgreSQL and Redis Docker Compose.
- Environment example files.
- Basic dashboard shell inspired by the user's preferred EntityAtlas/EntityCodex UI direction.

## Phase 1 Deliverables

- `package.json` workspace root.
- `pnpm-workspace.yaml`.
- `apps/web` Next.js app.
- `apps/api` Node.js API.
- `packages/database` Prisma setup.
- `packages/shared` shared types.
- `docker-compose.yml` with PostgreSQL and Redis.
- `.env.example`.
- Development commands in README.

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

- User, optional for later auth
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