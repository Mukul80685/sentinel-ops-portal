# Reference Point — 24 July 2026

This date marks a **verified operational baseline** for the SSACC portal (EXE/offline mode). Treat it as the restore target when the user asks to go back to **“24 Jul 26”**, **“24 July 2026”**, or **“the reference point”**.

## Git anchor

| Field | Value |
|-------|--------|
| **Tag** | `reference-2026-07-24` |
| **Commit** | `7d572f7dcfd7162854d5244d257c7bc2f336efa2` |
| **Commit message** | `most important final changes 24 jul` |
| **Branch at baseline** | `main` |

## How to restore (for humans or AI)

**Inspect only (read-only):**

```powershell
git checkout reference-2026-07-24
```

**Restore `main` to this exact code (destructive — discards later commits on `main`):**

```powershell
git stash push -m "pre-restore backup"
git checkout main
git reset --hard reference-2026-07-24
```

**Safer — new branch from baseline (keeps current `main` intact):**

```powershell
git checkout -b restore-from-2026-07-24 reference-2026-07-24
```

After restore, rebuild the EXE:

```powershell
npm run build
npx electron-builder --win
```

## Functional scope verified at this baseline

- **Priority & Allocation** — Add Satellite / Allocate works offline in EXE; identity-key fix for catalog rows.
- **INT Repository** — Drill-down counts, import sanitization, ghost-row cleanup, offline cell persistence.
- **Backup & Restore** — Priority and intel snapshots include extended keys; intel restore merges rows; export flush resilience.
- **EXE transport** — Data under `%APPDATA%\SSACC\`; reinstall does not wipe app data (`deleteAppDataOnUninstall: false`).
- **Visibility Matrix, Engagement, Reports, Map, Operational store** — Changes included in commit `7d572f7`.

## Notes

- One local unstaged file (`public/map.jpeg`) may differ after the tag commit; the tagged commit is the authoritative baseline.
- Push the tag to remote when ready: `git push origin reference-2026-07-24`
- Per `AGENTS.md`, avoid force-pushing rewritten history to the Lovable-connected branch unless explicitly requested.
