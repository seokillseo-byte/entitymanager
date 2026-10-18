# Next Steps

## Canonical Direction

Read [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md). It supersedes stale phase notes and extension-first automation plans.

## Current State

- Tauri/React Windows desktop application, local SQLite, secure provider settings, account/workflow/evidence foundations, Gmail OAuth, proxy records, CAPTCHA adapters, selector recipes, Chrome Extension Bridge, packaged Chromium, and GitHub Releases exist.
- Build 301 confirmed a structural problem: Chromium launch and account automation still rely on extension lifecycle behavior. The UI has multiple orchestration entry points, and a recorded `running` browser session does not prove a controllable browser worker exists.
- The repository has no Playwright/Puppeteer/CDP automation worker dependency. Current Managed Browser code is primarily a Chromium process launcher.
- Extension-first patching is frozen. The extension remains a fallback only.

## Immediate Implementation

**Phase 1.39A — Native Playwright Worker Foundation + Browser Control Center skeleton**

Required deliverables:

1. Select and document the packaged worker runtime strategy.
2. Add a versioned Desktop-worker protocol.
3. Start Chromium through Playwright persistent context.
4. Require startup handshake and heartbeat before marking a session `running`.
5. Support stop, crash detection, recovery, and safe persistent profile reuse.
6. Add hidden mode and CDP screenshot/preview transport.
7. Add minimal Browser Control Center worker cards.
8. Route Create All Entities through one backend campaign entry point.
9. Keep the old extension path behind an explicit fallback flag.
10. Add unit/contract tests and Windows packaging verification.

## Acceptance Criteria

- Clicking Create All Entities starts the actual worker without requiring the secondary Medium button.
- Visible mode produces one controlled browser; hidden mode produces no uncontrolled desktop windows.
- Desktop displays `starting`, `ready`, `running`, `blocked`, `failed`, or `stopped` from real worker state.
- A heartbeat timeout cannot remain falsely labelled `running`.
- Desktop can show a current-page preview for each active worker.
- Restarting Desktop can reconcile or recover persisted jobs.
- The Windows installer contains the worker and required Chromium assets.
- Chrome Extension is not required for the foundation smoke test.

## Following Phases

1. Phase 1.39B — Multi-thread Scheduler + Proxy Assignment.
2. Phase 1.39C — CAPTCHA Gateway + Gmail verification checkpoints.
3. Phase 1.39D — Medium full end-to-end certification.
4. Phase 1.40 — Curated Platform Catalog 300 + certification system.
5. Phase 1.41 — Adapter SDK and ranked platform expansion.
6. Phase 2 — Entity Care Automation.
7. Phase 3 — EEAT Planner, Evidence Graph, and Indexing Intelligence.

## Release Rule

Do not publish completion claims from source builds alone. Windows CI must be green, the official installer must exist, and the user must receive plain-language packaged-app test steps.
