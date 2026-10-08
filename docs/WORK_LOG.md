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

## Current Decision

The project should be built as a professional Windows desktop Entity Builder + Entity Care + EEAT Growth Platform, not merely an account creation tool.

Preferred V1 stack: Tauri desktop shell, React dashboard UI, local SQLite database, local workflow state machine, configurable AI/CAPTCHA/email/proxy integrations, and future Chrome Extension support.

Normal users should not need Docker, PostgreSQL, Redis, or terminal commands to use the packaged `.exe`.

## Next Recommended Action

Continue Phase 1.2 by running the GitHub Actions Windows build, downloading the installer artifact, then checking Money Site/Settings persistence inside the installed app.
