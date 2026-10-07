# EntityManager

EntityManager is planned as a Windows desktop Entity Builder + Entity Care + EEAT Growth Platform for SEO money sites.

The user-facing product must run on PC as a desktop app: the user should be able to click an `.exe` file and access the tool. It should not require the user to manually run a development server, Docker, or command-line workflow for normal use.

The goal is not only to create social/profile/blog accounts, but to build and maintain a high-quality entity ecosystem around a money site:

- Create and complete entity accounts.
- Store brand, NAP, author, service, media, and SEO data.
- Care for existing money-site articles by publishing supporting content to suitable entity accounts.
- Research keywords, EEAT gaps, topical authority opportunities, and entity gaps.
- Generate safe content variants instead of duplicating the same bio or article everywhere.
- Track evidence: live URLs, screenshots, status, account health, index state, and reports.

## Product Direction

EntityManager has three major independent modules:

1. Entity Builder
   - Create accounts and profiles on social, blog 2.0, forum, citation, media, and profile platforms.
   - Handle CAPTCHA, email verification, manual steps, retry, and evidence capture.

2. Entity Care
   - Scan money-site content.
   - Suggest and execute care campaigns for existing articles.
   - Publish supporting content, social posts, profile updates, and cross-links through existing accounts.

3. EEAT Planner
   - Research keywords, topical clusters, author/entity gaps, and trust signals.
   - Suggest content, author, citation, schema, and distribution plans.

## First Implementation Target

V1 should focus on a stable Windows desktop application:

- Tauri desktop shell, preferred for a lightweight `.exe` build.
- React/Next-style dashboard UI.
- Local SQLite database for the normal desktop build.
- Prisma ORM if it fits cleanly with the local runtime.
- Background task engine for local queues and workflow state.
- Adapter-based platform system.
- AI/CAPTCHA/email/proxy integrations designed as configurable providers.
- Future Chrome Extension support for semi-auto browser workflows.

PostgreSQL, Redis, and Docker may still be useful for development, testing, or a future server edition, but they should not be required for the normal PC `.exe` user experience.

## Repository Status

This repository starts with planning and implementation-control documents so future ChatGPT/Codex sessions can continue without losing context.