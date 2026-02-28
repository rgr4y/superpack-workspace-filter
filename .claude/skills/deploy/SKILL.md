---
name: deploy
description: Bump version, publish to npm, commit, push, and update on server
---

# Deploy

One-shot deploy: bump, publish, commit, push, update on server.

## Steps

1. Run `npm test` — abort if anything fails
2. Run `npm version patch --no-git-tag-version` (bumps package.json + SKILL.md via lifecycle script)
3. Run `npm publish`
4. Stage package.json, SKILL.md, and any other dirty tracked files
5. Amend into the last commit (or create a new one if the tree was clean before the bump)
6. `git push`
7. Report the new version number and confirm server restart
