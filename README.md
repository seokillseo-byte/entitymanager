# EntityManager

EntityManager is planned as an Entity Builder + Entity Care + EEAT Growth Platform for SEO money sites.

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

V1 should focus on a stable local SaaS-style app plus future Chrome Extension support:

- Next.js web app.
- Node.js API.
- PostgreSQL database.
- Redis queue.
- Prisma ORM.
- Adapter-based platform system.
- AI/CAPTCHA/email/proxy integrations designed as configurable providers.

## Repository Status

This repository starts with planning and implementation-control documents so future ChatGPT/Codex sessions can continue without losing context.