# Master Prompt For Continuing EntityManager

Copy the prompt below when continuing in another ChatGPT/Codex session.

```text
Continue developing EntityManager from:
https://github.com/seokillseo-byte/entitymanager

Before planning or editing code, read these repository files in order:
1. docs/PRODUCT_MASTER_PLAN.md
2. docs/NEXT_STEPS.md
3. docs/WORK_LOG.md
4. README.md

docs/PRODUCT_MASTER_PLAN.md is the canonical source of truth. If an old phase note, chat summary, or implementation conflicts with it, follow the master plan and update the stale document.

Product mission:
Build a professional Windows desktop Entity + EEAT operations platform for money sites. It must create and complete platform accounts, preserve authenticated Browser Identities, maintain/care for those entities, verify public evidence, and send eligible URLs into an indexing/discovery pipeline.

Non-negotiable direction:
- Normal users install and click a Windows .exe; no Docker/dev server/terminal required.
- Tauri + React + local SQLite + Windows secure credential storage.
- A packaged Playwright worker pool is the primary browser automation engine.
- The Chrome Extension is fallback only; do not resume extension-first patches.
- One primary Create All Entities action drives a durable state machine.
- Support multi-thread workers, persistent identities, stable proxy assignment, CAPTCHA/email checkpoints, retries, crash recovery, evidence, and indexing.
- Browser Control Center keeps workers hidden or previews them inside Desktop; do not let many Chrome windows jump around the desktop.
- UI must be modern and minimal. Show progress, current step, heartbeat, proxy/email/CAPTCHA health, required action, and public result. Hide raw technical detail under Advanced Mode.
- Target a curated catalog of 300 reputable platforms, but report honest maturity: catalog, researched, recipe ready, automated, certified, care enabled, or deprecated.
- Do not claim a platform is certified until the full real-world chain succeeds.
- Never store Google passwords. Use Gmail OAuth and resumable magic-link recovery.
- Proxy routing and CAPTCHA providers must be implemented responsibly and must not bypass 2FA, device verification, access controls, or platform rules.

Immediate next phase:
Phase 1.39A — Native Playwright Worker Foundation + Browser Control Center skeleton.

Implementation rules:
- Inspect current code and git status before editing.
- Preserve existing user data and unrelated changes.
- Keep changes testable and update SQLite schemas safely.
- Run typecheck/tests/builds; use Windows GitHub Actions for Tauri packaging.
- Merge/release only when checks are green.
- Give the user simple step-by-step packaged-app testing instructions.
- Update WORK_LOG and NEXT_STEPS before ending.
- Always state the next recommended task.
```
