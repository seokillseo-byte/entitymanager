# Master Prompt For Continuing EntityManager

Use this prompt when moving to another ChatGPT/Codex account or starting a new session.

```text
You are helping me build EntityManager at this GitHub repository:

https://github.com/seokillseo-byte/entitymanager

Project goal:
Build a professional Windows PC desktop Entity Builder + Entity Care + EEAT Growth Platform for SEO money sites.

Critical requirement:
The final product must run as a PC desktop tool. The user should be able to click a Windows `.exe` file and open/use the tool. Normal users should not need to manually run Docker, PostgreSQL, Redis, a dev server, or command-line commands.

Preferred technical direction:
- Desktop shell: Tauri, unless there is a strong reason to choose Electron.
- UI: React/Next-style dashboard experience inside the desktop app.
- Database: local SQLite for normal desktop usage.
- Workflow queue: local task/state-machine tables first.
- TypeScript for app logic where practical.
- Rust/Tauri backend only where useful for packaging, OS access, and secure local commands.
- Future Chrome Extension support for semi-auto browser workflows.
- PostgreSQL, Redis, and Docker are optional for development or a future server edition, not required for normal `.exe` use.

This is not only a tool to create accounts. It must create, maintain, and grow a high-quality entity ecosystem around a money site.

Core product modules:

1. Entity Builder
- Create accounts/profiles on social, blog 2.0, forum, citation, media, and profile platforms.
- Complete profiles with brand, NAP, author, media, service, and money-site links.
- Support CAPTCHA API, email verification, proxy settings, manual pause/resume, retries, and evidence capture.

2. Entity Care
- Scan existing money-site articles via sitemap, RSS, WordPress API, or manual import.
- Analyze each URL by topic, keyword, category, intent, and EEAT needs.
- Suggest and execute care plans using accounts already created.
- Publish supporting posts, summaries, social posts, Q&A content, and media posts.
- Support natural cross-linking between money site, supporting posts, social profiles, and media assets.

3. EEAT Planner
- Research keyword/topic opportunities.
- Suggest topical clusters.
- Identify missing author, organization, citation, review, schema, source, and trust signals.
- Propose content plans, refresh plans, and entity-care schedules.

Important product philosophy:
- Do not build spam automation.
- Do not duplicate the same content everywhere.
- Use AI to create natural content variants per platform.
- Keep auto + semi-auto workflows, because many quality platforms require CAPTCHA, email verification, or manual steps.
- Track evidence, live URLs, screenshots, index status, account health, and reports.
- Build with scalable adapter architecture so new platforms can be added without changing core workflow.

Repository continuity rules:
- First inspect the repository before coding.
- Read README.md and all documents under docs/.
- Continue from docs/NEXT_STEPS.md and docs/WORK_LOG.md.
- Do not restart architecture from scratch unless there is a serious reason.
- At the end of every session, update docs/WORK_LOG.md and docs/NEXT_STEPS.md.
- Always suggest the next useful task before ending.

Current desired build style:
Professional vibe coding. Discuss when strategy matters, but when the next phase is clear, implement directly. Keep changes small enough to verify. Run tests/builds when available. Push meaningful commits to GitHub.

User preference:
The user wants proactive guidance. Do not wait for the user to ask what to do next at the end of each conversation. Always state the next recommended step.
```

## Short Version

```text
Continue building EntityManager from https://github.com/seokillseo-byte/entitymanager. Read README.md and docs/*. Follow docs/NEXT_STEPS.md. It is a Windows PC desktop `.exe` Entity Builder + Entity Care + EEAT Growth Platform for SEO money sites. Prefer Tauri + React dashboard + local SQLite + local workflow state machine. Normal users should click an `.exe` to open the tool and should not need Docker/PostgreSQL/Redis/dev server. Do not restart from scratch. Update WORK_LOG and NEXT_STEPS before ending, and suggest the next task.
```