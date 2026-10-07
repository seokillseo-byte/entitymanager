# EntityManager Vibe Coding Plan

## Core Principle

Build in small professional phases. Each phase must leave the repository in a runnable, understandable, and documented state.

Do not rush into 100+ platforms before the core workflow is stable.

## Critical Product Requirement

EntityManager is a Windows PC desktop tool. The final user experience should be simple: click an `.exe` file and open the tool.

Normal users should not need to run Docker, PostgreSQL, Redis, terminal commands, or a development server.

Preferred V1 architecture:

- Desktop shell: Tauri.
- UI: React dashboard inside the desktop app.
- Database: local SQLite.
- Workflow queue: local task/state-machine tables first.
- Packaging: Windows `.exe` installer/app build.
- Future browser support: Chrome Extension bridge for semi-auto workflows.

PostgreSQL, Redis, and Docker can be used for development or a future server edition, but not as a normal-user requirement.

## Product Name

Working name: EntityManager

Alternative product names for later branding:

- EntityAtlas
- EntityCodex
- EntityOps
- EntityGrowth

## High-Level Modules

### 1. Entity Builder

Purpose: create and complete entity accounts.

Key features:

- Money-site project setup.
- Brand, NAP, author, service, product, and media profiles.
- Platform library.
- Account creation workflows.
- CAPTCHA API support.
- Email verification support.
- Manual pause/resume support.
- Evidence capture.
- Profile URL and backlink tracking.

### 2. Entity Care

Purpose: maintain and strengthen accounts after creation.

Key features:

- Scan money-site URLs from sitemap, RSS, WordPress API, or manual import.
- Analyze article topic, intent, category, keyword, and EEAT needs.
- Suggest care plans for each article.
- Generate supporting posts, summaries, social posts, Q&A answers, and micro content.
- Publish to suitable created accounts.
- Plan natural cross-linking between entity assets and money-site URLs.
- Track live status and index status.

### 3. EEAT Planner

Purpose: research what the money site is missing and suggest a long-term growth plan.

Key features:

- Keyword research.
- Topical cluster planning.
- Author/entity gap analysis.
- Trust-signal checklist.
- Content refresh planning.
- Supporting content recommendations.
- Platform-fit recommendations.

## Entity Types To Support

V1 data model should prepare for these entity types:

- Brand Entity
- Organization Entity
- Person/Author Entity
- Local Entity
- Service Entity
- Product Entity
- Topic Entity
- Content Entity
- Social Entity
- Media Entity
- Review Entity
- Citation Entity
- Knowledge Entity
- Event Entity
- Dataset/Report Entity
- Software/App Entity

## Required Input Data

The app should collect enough data before automation starts. Missing data should reduce the Entity Readiness Score.

### Money Site

- Domain
- Homepage URL
- Sitemap URL
- RSS URL
- WordPress API URL, optional
- Main language
- Target country
- Industry
- Business model

### Brand

- Brand name
- Short brand name
- Slogan
- Short description
- Long description
- Brand tone
- Unique selling points

### NAP / Business

- Legal/business name
- Address
- Phone
- Email
- Opening hours
- Tax/company code, optional
- Google Maps URL, optional

### Media

- Logo
- Favicon
- Avatar
- Banner
- Product/service images
- Office/team images, optional

### SEO

- Main keywords
- Secondary keywords
- Target URLs
- Anchor text variants
- Competitors
- Priority pages

### Author / Expert

- Author name
- Role/title
- Bio
- Avatar
- Experience
- Credentials
- Existing profile URLs

### Existing Entity Assets

- Existing social profiles
- Existing citations
- Existing author pages
- Existing guest posts
- Existing branded properties

### API Integrations

- AI provider keys
- CAPTCHA provider keys
- Email/IMAP/API credentials
- Proxy provider settings
- Image provider keys
- Indexing API keys

### Automation Rules

- Maximum daily account creations
- Maximum daily posts
- Automation mode: auto, semi-auto, manual review
- Anchor ratio rules
- Cross-linking rules
- Platforms to avoid
- Country/language rules

## Entity Readiness Score

Score project readiness before running automation.

- 0-40: Not enough data. Automation should be blocked or strongly warned.
- 41-70: Basic entity building possible.
- 71-85: Good campaign readiness.
- 86-100: Strong campaign readiness with EEAT and care workflows.

## Cross-Linking Rule

Cross-linking can help SEO only when it is natural, varied, and supported by unique content.

Good:

- Brand profile links to money site.
- Supporting blog post links to a relevant money-site article.
- Social post links to the supporting blog post or money-site article.
- Image/video assets reference the brand and related topic.

Avoid:

- Identical content across all platforms.
- Exact-match anchor everywhere.
- All links posted at the same time.
- Obvious circular link patterns.

## Recommended Build Phases

### Phase 0: Repository Foundation

- README
- Project context documents
- Master prompt
- Tech stack decision
- Development workflow

### Phase 1: Desktop App Foundation

- Monorepo structure
- Tauri desktop shell
- React dashboard UI
- Local SQLite database setup
- Local workflow state skeleton
- Environment/settings structure
- Windows `.exe` build notes
- Basic dashboard layout

### Phase 2: Entity Data Core

- Project model
- Brand profile
- NAP profile
- Author profile
- Service/product profile
- Media profile
- SEO profile
- Readiness score

### Phase 3: Platform Library + Adapter Contract

- Platform database
- Platform categories
- Difficulty scoring
- Automation capability flags
- Adapter interface
- Mock adapter for testing

### Phase 4: Workflow Engine

- Local task table
- State machine
- Task statuses
- Retry rules
- Pause/resume
- Manual-required steps

### Phase 5: Entity Builder MVP

- 5-10 starter platform adapters
- Account records
- Profile completion records
- Evidence records
- Basic reports

### Phase 6: Entity Care MVP

- Sitemap/RSS/manual URL import
- Article analysis
- Care recommendations
- Supporting content generation
- Publishing workflow using existing accounts

### Phase 7: EEAT Planner MVP

- Keyword/topic input
- Topical map suggestions
- EEAT gap checklist
- Content plan suggestions
- Entity gap suggestions

### Phase 8: Integrations

- AI provider abstraction
- CAPTCHA provider abstraction
- Email provider abstraction
- Proxy provider abstraction
- Indexing provider abstraction

### Phase 9: Reporting + Entity Graph

- Entity graph
- Evidence bank
- Account health
- URL live status
- Campaign report

### Phase 10: Scale Platform Library

- Add more adapters safely.
- Add platform test fixtures.
- Track platform reliability.

## Rule For Every Coding Session

At the end of every session, update:

- `docs/WORK_LOG.md`
- `docs/NEXT_STEPS.md`
- Any changed setup instructions

This keeps continuity when switching ChatGPT accounts or sessions.