# EntityManager Product Master Plan

> Canonical project direction approved on 2026-10-18.
>
> This document is the single source of truth for product scope, architecture, priorities, and completion criteria. If another document, old phase note, chat summary, or implementation conflicts with this file, follow this file and update the stale document.

## 1. Product Mission

EntityManager is a Windows desktop Entity, EEAT, and authority operations platform for money sites. A normal user installs an `.exe`, enters complete brand/entity data once, selects suitable platforms, and starts a campaign.

The intended end-to-end result is:

1. Research the money site, entity gaps, topical opportunities, and suitable platforms.
2. Create platform accounts with minimal human interaction.
3. Complete profiles with consistent NAP, organization, author, expertise, links, logo/avatar, banner, and platform-specific EEAT fields.
4. Verify the public profile and retain evidence.
5. Submit eligible public URLs to the indexing/discovery pipeline.
6. Preserve authenticated browser identities for future work.
7. Care for the entity over time by scanning the money site, planning supporting content, publishing platform-specific variants, monitoring links, and recovering expired sessions.

The product is not complete when a browser merely opens. It is complete only when a platform workflow reaches a verified public result or an explicit, actionable checkpoint.

## 2. Non-Negotiable Product Requirements

- Windows desktop `.exe`; no Docker, local dev server, PostgreSQL, Redis, or terminal required for normal use.
- One primary action: **Create All Entities**.
- Automation-first, with human intervention only for unavoidable challenges such as 2FA, device verification, consent, or unsupported verification.
- Multiple concurrent browser workers with configurable global, campaign, platform, and identity limits.
- Persistent Browser Identity per entity/project, with stable proxy assignment and resumable authentication.
- HTTP, HTTPS, SOCKS5, authenticated, residential, ISP/static, mobile, datacenter, and provider-endpoint proxy configurations.
- CAPTCHA gateway with pluggable providers and explicit supported task types. CAPTCHA handling must respect provider/platform rules and must not bypass device verification, 2FA, or access controls.
- Gmail OAuth for verification mail and magic-link recovery; never store a Google password.
- Platform catalog target of 300 reputable candidates, with honest maturity levels instead of claiming all 300 are automated.
- Entity Profile input completeness validation before campaign launch.
- Evidence, screenshots, public URLs, account health, workflow history, and indexing state retained locally.
- Extension is a fallback only. It must not remain the primary automation engine.
- Every worker reports heartbeat, current step, last action, error, retry state, proxy state, and evidence.
- UI is modern and minimal. Raw selectors, PIDs, queue IDs, payload JSON, and API responses are hidden in Advanced Mode.

## 3. Canonical Desktop Architecture

### Desktop shell

- Tauri 2 + React.
- Local SQLite as the durable system of record.
- Windows Credential Manager/keyring for secrets.
- GitHub Actions builds and publishes versioned Windows installers.

### Native browser automation

- A packaged Playwright browser worker/sidecar is the primary automation engine.
- Packaged Chromium runtime is shared; persistent profile data is separated by Browser Identity.
- Use `launchPersistentContext` and direct Playwright/CDP control.
- Platform actions are implemented through adapters, not popup button automation.
- Chrome Extension Bridge remains available only for fallback or platform-specific edge cases.
- Worker-to-Desktop communication uses a versioned local JSON-RPC/WebSocket or equivalent authenticated localhost protocol.
- Every launch requires a startup handshake: process ready, browser context ready, active page ready, worker heartbeat, and adapter payload accepted.

### State machine

Canonical account provisioning stages:

`preflight -> queued -> browser_starting -> signup -> email_verification -> captcha -> profile_text -> profile_media -> profile_save -> public_verification -> evidence -> indexing -> completed`

Every stage supports checkpoint persistence, bounded retries with backoff, pause/resume/cancel, crash recovery, actionable failure codes, screenshots, and platform-level isolation.

## 4. Browser Worker Pool and Concurrency

- Configurable maximum global workers.
- Configurable maximum workers per campaign and platform.
- One active writer per Browser Identity.
- Stable proxy assignment for the full account lifecycle.
- CPU, memory, disk, and browser-profile storage guards.
- Fair scheduling and priority queues.
- Circuit breaker when a platform or provider begins failing repeatedly.
- Default conservative concurrency; increase only after health checks.
- Browser profiles can be cleaned, archived, restored, or expired without deleting evidence/account records.

## 5. Browser Control Center

Multiple native Chromium windows must not jump around the user's desktop.

Default modes:

1. **Hidden:** worker runs without visible windows where technically supported.
2. **Monitor in Tool:** CDP screencast or periodic screenshots appear as live worker cards inside EntityManager.
3. **Manual Control:** only the selected worker opens or accepts forwarded interaction when an unavoidable checkpoint requires the user.

The Browser Control Center shows platform/account, current step, elapsed time, heartbeat, proxy health, email/CAPTCHA state, last meaningful action, and pause/resume/stop/manual-control actions.

The Control Center is a dedicated **Browser Workspace window**, separate from the campaign setup window. It never opens one unmanaged Chromium window per worker. The workspace renders one managed browser surface for one thread, two side-by-side surfaces for two threads, and a responsive grid for three to six threads. Closing this workspace only hides monitoring; it does not stop the campaign. The main Create Entity page shows aggregate progress and a single button to reopen the workspace, not an inline Live Medium popup.

Technical logs, selectors, network details, payloads, and screenshots remain under an expandable diagnostic view. Do not use fragile native-window embedding as the primary design; prefer controlled hidden contexts plus CDP preview inside Tauri.

## 6. Platform Adapter System

Each platform adapter owns eligibility/preflight, signup/login/session detection, email verification, CAPTCHA contract, profile fields, avatar/banner upload, save behavior, public URL discovery, evidence rules, care capabilities, rate limits, locales, and known manual checkpoints.

Platform maturity levels:

1. `catalog`
2. `researched`
3. `recipe_ready`
4. `automated`
5. `certified`
6. `care_enabled`
7. `deprecated`

The catalog may reach 300 platforms, but only a platform that passes the complete real-world certification chain may be labelled `certified`.

Initial certification order: Medium, GitHub, About.me, Tumblr, then additional platforms ranked by authority, entity value, stability, and relevance.

## 7. Entity Profile Data Contract

Campaign launch validates all applicable data so incomplete input cannot silently reduce quality:

- Money site: domain, canonical homepage, sitemap/RSS, language, country, industry, topics.
- Organization: brand/legal name, description, founding date, services, category, slogan.
- NAP: canonical name, address, phone, public email, service information.
- Author/person: name, display name, role, bios, expertise, credentials, experience, author URL.
- Identity: preferred usernames, recovery email, locale, only legitimate required attributes.
- Links: homepage, contact, about, author, privacy, sameAs, trust pages.
- Media: local logo/avatar, square variants, banner/OG image, alt text, dimensions, size and MIME validation.
- EEAT: expertise, credentials, awards, memberships, citations, press, policies, trust signals.
- Voice: language, tone, prohibited claims, disclosure, platform-specific bio lengths.

Secrets and authentication tokens never belong in plain SQLite fields.

## 8. Proxy and CAPTCHA Gateways

### Proxy manager

- Import, validate, assign, quarantine, and rotate only according to an explicit policy.
- Persist IP, country, latency, health, provider, expiration, and assignment history.
- Do not change proxy mid-session unless a recovery policy explicitly requires it.
- Proxies are for stable routing, localization, reliability, and workload separation—not for evading platform limits or concealing abusive activity.

### CAPTCHA gateway

- Normalized provider adapters for 2Captcha, CapSolver, Anti-Captcha, CapMonster Cloud, and future providers.
- Supported contracts may cover reCAPTCHA v2/invisible, supported Enterprise tasks, hCaptcha, Turnstile, and image/text challenges when allowed.
- Detect -> create task -> poll -> inject through browser context -> verify acceptance -> bounded retry.
- Unsupported, rejected, device-verification, or 2FA challenges produce an explicit manual checkpoint.

## 9. Entity Care

Entity Care is independent from account creation but reuses certified accounts and Browser Identities.

- Discover content through sitemap, RSS, WordPress API, or import.
- Classify URL, topic, intent, freshness, author, and EEAT gaps.
- Research keywords, entities, citations, and suitable platforms.
- Generate native, non-duplicated content variants per platform.
- Schedule supporting posts, summaries, media posts, profile updates, and appropriate cross-links.
- Re-authenticate using the saved session or Gmail magic-link recovery.
- Monitor publication URLs, removed posts, account restrictions, and care cadence.
- Avoid synchronized mass posting and identical content footprints.

## 10. Evidence and Indexing

Only enqueue a URL after verification confirms it is public, successful, not signin/preview/draft, contains expected entity signals, has a known canonical URL, and has stored evidence.

Indexing/discovery adapters may include sitemap workflows, IndexNow-supported engines, internal-link discovery, and APIs only for content types permitted by official policies. Track discovered/indexed state and avoid endless repeated submissions.

## 11. Minimal Product UI

Primary navigation:

1. Overview
2. Create Entity
3. Entity Care
4. Platforms
5. Indexing
6. Settings

Create Entity contains compact campaign setup, preflight readiness, selected platforms, concurrency/proxy policy, one Create All Entities button, aggregate progress, compact platform rows, and Browser Control Center.

Always show progress, current stages, worker heartbeat, last update, proxy/email/CAPTCHA health, verified public URL, and required action. Hide raw JSON, selectors, queue IDs, PIDs, SQL, and repetitive logs by default.

## 12. Delivery Roadmap

### Phase 1.39A — Native Playwright Worker Foundation

- Add packaged worker and Playwright/Chromium integration.
- Implement authenticated Desktop-worker protocol and heartbeat.
- Implement persistent context launch, stop, show/hide, and recovery.
- Add CDP screenshot/preview foundation.
- Add worker health diagnostics and packaging tests.
- Remove extension dependency from the primary launch path.

### Phase 1.39B — Scheduler, Multi-threading, Proxy Assignment

- Worker pool, limits, pause/resume/cancel, priorities, backoff, circuit breakers.
- Proxy types, secure credentials, health checks, stable identity assignment, quarantine.
- Crash-safe SQLite checkpoints.

### Phase 1.39C — CAPTCHA and Verification Gateways

- Provider-neutral CAPTCHA task contracts and multiple providers.
- Browser-context token handling and acceptance verification.
- Gmail OAuth verification/magic-link recovery integrated into worker checkpoints.

### Phase 1.39D — Medium End-to-End Certification

- Signup/login recovery, email verification, profile EEAT fields, media, save, public verification, evidence, indexing, and session recovery.
- Medium is not certified until the complete chain succeeds from the single campaign button.

### Phase 1.40 — Platform Catalog 300 and Certification System

- Curated catalog with relevance, authority, country, risk, entity value, and maturity.
- Platform-set recommendations and certification/regression dashboards.

### Phase 1.41 — Adapter SDK and Platform Expansion

- Stable adapter contract, templates, selector/evidence tooling, and fixtures.
- Certify GitHub, About.me, Tumblr, then expand in ranked batches.

### Phase 2 — Entity Care Automation

- Site scanning, research, content transformation, scheduling, publishing, monitoring, and session recovery.

### Phase 3 — EEAT Planner, Evidence Graph, and Indexing Intelligence

- Keyword/entity gap research, topical planning, trust-signal recommendations, evidence graph, reports, and index monitoring.

## 13. Immediate Next Step

Implement **Phase 1.39A — Native Playwright Worker Foundation + Browser Control Center skeleton**.

Do not add more extension patches or new platform recipes until the worker can start from Create All Entities, prove a heartbeat, open the requested page in the correct persistent identity, provide a Desktop preview, execute a basic adapter action, stop/recover safely, and package in the Windows installer.

## 14. Definition of Done for Every Phase

- Merge only after tests and Windows CI are green.
- Official GitHub Release includes a downloadable installer.
- SQLite migrations preserve existing user data.
- Secrets remain in OS-backed secure storage.
- UI reports honest state; no false `running` or `completed` labels.
- Packaged-app test instructions are written for a non-technical user.
- Update `docs/WORK_LOG.md` and `docs/NEXT_STEPS.md`.
- State the next recommended task explicitly.


### Phase 1.39D.1 — Unified Multi-Worker Browser Workspace

- Dedicated Tauri Browser Workspace window opened automatically with a campaign.
- One to six worker slots in one managed window; no scattered Chromium windows.
- Live worker surfaces, direct click forwarding, pause/resume/stop and expand controls.
- Empty slots clearly show that they are waiting; they must never imply a browser session exists.
- Campaign state remains authoritative and continues when the workspace is closed.
- Inline Live Medium modal is removed from Create Entity.
