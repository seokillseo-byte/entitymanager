# EntityManager Release and Overview Download Policy

This file is the shared project rulebook for maintainers, contributors, and AI coding assistants working in this repository. Read it before changing the Overview, release workflow, desktop download actions, or Chrome extension packaging.

## User-facing rule

- The desktop app's Overview must be the single place to download the newest supported Windows installer and Chrome Extension.
- Show exactly one current Windows installer (.exe) and one current Chrome Extension (.zip); do not list old versions or historical build artifacts in the Overview.
- Clearly label the product, release version/tag, publish date/build, and filename so the user can identify the current package.
- Both download actions must resolve to assets belonging to the same latest published GitHub Release. Never point users at an expired Actions artifact as the permanent download link.
- If a newer release is not available, do not pretend that an Actions test artifact is an official release. Explain the distinction clearly and provide the successful Actions artifact only as a temporary testing download when appropriate.
- Keep the Overview compact; old releases may remain in GitHub's release history but must not occupy space in the Overview.

## Required release workflow

1. Make the source changes and update relevant documentation.
2. Run the repository's checks and build both the Windows installer and Chrome Extension.
3. Fix all failures and rerun checks until the required jobs are green.
4. Publish both packages as assets of the same new GitHub Release. Use stable asset names consumed by the Overview, including `EntityManager-Chrome-Extension.zip` and the Windows `EntityManager_*_x64-setup.exe` installer naming pattern.
5. Verify the release API and confirm both expected assets exist before claiming the Overview is ready.
6. Merge the change only when required checks pass. After a new desktop build is installed, verify both Overview buttons and confirm they open the current release assets.
7. Report the exact current release/version and provide the direct installer link. Do not claim a feature is shipped merely because a PR or Actions run is green.

## Continuity and cross-account context

- Repository files are the durable shared source of truth for project-wide rules and decisions. Keep this policy and the work log updated when release behavior changes.
- Do not rely on private chat memory to preserve project requirements; check this file and the current work log/PR state when resuming work from another account or session.
- When asked to update the app, preserve the latest-only Overview download behavior unless the user explicitly changes this requirement.
